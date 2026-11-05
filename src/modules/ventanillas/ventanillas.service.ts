import { AppError } from "../../common/errors.js";
import { sedeDelPersonal } from "../../common/sede.js";
import { emitirCola } from "../../lib/eventos.js";
import { prisma } from "../../lib/prisma.js";
import type { VentanillaRow } from "./ventanillas.mapper.js";
import type { CreateVentanillaInput, UpdateVentanillaInput } from "./ventanillas.dto.js";

// Gestión de ventanillas (crear/editar: solo ADMIN; listar activas: también el OPERADOR).
//
//  · Todo queda encerrado en la sede del usuario (`sedeDelPersonal`); una ventanilla de otra sede → 404.
//  · No se ELIMINA una ventanilla que ya atendió turnos (es historial): se DESACTIVA.
//  · No se desactiva ni elimina una ventanilla con un turno en curso (llamado o en atención):
//    dejaría a esa persona sin ventanilla. Primero se finaliza ese turno.

const INCLUIR = {
  servicios: { select: { servicio: { select: { id: true, nombre: true, prefijo: true } } } },
} as const;

const esErrorPrisma = (e: unknown, code: string) =>
  typeof e === "object" && e !== null && "code" in e && e.code === code;

async function buscar(id: string, sedeId: string): Promise<VentanillaRow> {
  const v = await prisma.ventanilla.findFirst({ where: { id, sedeId }, include: INCLUIR });
  if (!v) throw AppError.notFound("Ventanilla no encontrada");
  return v;
}

// Los servicios elegidos deben existir Y ser de esta sede (un id ajeno no se acepta).
async function validarServicios(sedeId: string, ids: string[]) {
  const n = await prisma.servicio.count({ where: { id: { in: ids }, sedeId } });
  if (n !== ids.length) throw AppError.badRequest("Alguno de los servicios elegidos no existe");
}

async function validarNombreLibre(sedeId: string, nombre: string, ignorarId?: string) {
  const choque = await prisma.ventanilla.findFirst({
    where: {
      sedeId,
      nombre: { equals: nombre, mode: "insensitive" },
      ...(ignorarId && { id: { not: ignorarId } }),
    },
    select: { nombre: true },
  });
  if (choque) throw AppError.conflict(`Ya existe una ventanilla llamada «${choque.nombre}»`);
}

async function exigirSinTurnoEnCurso(id: string, accion: string) {
  const enCurso = await prisma.turno.count({
    where: { ventanillaId: id, estado: { in: ["LLAMADO", "ATENDIENDO"] } },
  });
  if (enCurso > 0) {
    throw AppError.conflict(
      `No se puede ${accion} la ventanilla: tiene un turno en curso. Finalízalo primero.`,
    );
  }
}

export const ventanillasService = {
  async list(actorId: string, incluirInactivas: boolean) {
    const { sedeId } = await sedeDelPersonal(actorId);
    return prisma.ventanilla.findMany({
      where: { sedeId, ...(incluirInactivas ? {} : { activa: true }) },
      orderBy: { nombre: "asc" },
      include: INCLUIR,
    });
  },

  async create(input: CreateVentanillaInput, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    await validarNombreLibre(sedeId, input.nombre);
    await validarServicios(sedeId, input.servicioIds);
    try {
      const creada = await prisma.ventanilla.create({
        data: {
          sedeId,
          nombre: input.nombre,
          activa: input.activa,
          servicios: { create: input.servicioIds.map((servicioId) => ({ servicioId })) },
        },
        include: INCLUIR,
      });
      emitirCola(sedeId);
      return creada as VentanillaRow;
    } catch (e) {
      // Respaldo: dos ADMIN creando el mismo nombre a la vez (la BD tiene el índice único).
      if (esErrorPrisma(e, "P2002"))
        throw AppError.conflict("Ya existe una ventanilla con ese nombre");
      throw e;
    }
  },

  async update(id: string, input: UpdateVentanillaInput, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    await buscar(id, sedeId);
    if (input.nombre) await validarNombreLibre(sedeId, input.nombre, id);
    if (input.servicioIds) await validarServicios(sedeId, input.servicioIds);
    if (input.activa === false) await exigirSinTurnoEnCurso(id, "desactivar");

    try {
      await prisma.$transaction(async (tx) => {
        await tx.ventanilla.update({
          where: { id },
          data: {
            ...(input.nombre !== undefined && { nombre: input.nombre }),
            ...(input.activa !== undefined && { activa: input.activa }),
          },
        });
        // Los servicios se REEMPLAZAN completos (borrar y volver a crear) en la misma transacción:
        // nunca queda a medias.
        if (input.servicioIds) {
          await tx.ventanillaServicio.deleteMany({ where: { ventanillaId: id } });
          await tx.ventanillaServicio.createMany({
            data: input.servicioIds.map((servicioId) => ({ ventanillaId: id, servicioId })),
          });
        }
      });
    } catch (e) {
      if (esErrorPrisma(e, "P2002"))
        throw AppError.conflict("Ya existe una ventanilla con ese nombre");
      throw e;
    }
    emitirCola(sedeId);
    return buscar(id, sedeId);
  },

  async remove(id: string, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    await buscar(id, sedeId);
    await exigirSinTurnoEnCurso(id, "eliminar");
    const usos = await prisma.turno.count({ where: { ventanillaId: id } });
    if (usos > 0) {
      throw AppError.conflict(
        "Esta ventanilla ya atendió turnos y es parte del historial. Desactívala en vez de eliminarla.",
      );
    }
    await prisma.ventanilla.delete({ where: { id } }); // la tabla puente se borra sola (onDelete: Cascade)
    emitirCola(sedeId);
  },
};
