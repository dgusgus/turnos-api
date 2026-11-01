import { AppError } from "../../common/errors.js";
import { skipOf } from "../../common/pagination.js";
import { sedeDelPersonal } from "../../common/sede.js";
import { prisma } from "../../lib/prisma.js";
import { ESTADOS_VIGENTES } from "../citas/citas.estados.js";
import type {
  CreateServicioInput,
  ListServiciosQuery,
  ReemplazarHorariosInput,
  UpdateServicioInput,
} from "./servicios.dto.js";
import { validarVentanas } from "./horarios.validacion.js";

// Gestión del catálogo de servicios (solo ADMIN). Reglas que conviene entender:
//
//  · Todo queda ENCERRADO en la sede del ADMIN (`sedeDelPersonal`): nunca se confía en un sedeId
//    que mande el cliente. Un servicio de otra sede responde 404 (no 403) para no revelar que existe.
//  · No se puede ELIMINAR un servicio que ya tiene citas o turnos (es historial): se DESACTIVA.
//  · Cambiar la configuración NO toca lo ya reservado. Una cita guarda su propio inicio/fin; si el
//    ADMIN cambia la duración o los horarios, solo las citas NUEVAS siguen la regla nueva. Cuando
//    hay citas vigentes afectadas, la API devuelve `advertencias` para que el ADMIN lo sepa.

const INCLUIR = { horarios: true } as const;

const esErrorPrisma = (e: unknown, code: string) =>
  typeof e === "object" && e !== null && "code" in e && e.code === code;

const plural = (n: number) => (n === 1 ? "1 cita vigente" : `${n} citas vigentes`);

async function buscar(id: string, sedeId: string) {
  const servicio = await prisma.servicio.findFirst({ where: { id, sedeId }, include: INCLUIR });
  if (!servicio) throw AppError.notFound("Servicio no encontrado");
  return servicio;
}

// Citas que todavía no ocurrieron y siguen en pie (pendientes o confirmadas).
const citasVigentesFuturas = (servicioId: string, ahora = new Date()) =>
  prisma.cita.count({
    where: { servicioId, inicio: { gte: ahora }, estado: { in: ESTADOS_VIGENTES } },
  });

// ¿Ya existe OTRO servicio con ese nombre o prefijo en la sede? Se revisa a mano (además del
// índice único de la BD) para poder decir CUÁL de los dos choca, en vez de un error genérico.
async function validarNoDuplicado(
  sedeId: string,
  { nombre, prefijo }: { nombre?: string; prefijo?: string },
  ignorarId?: string,
) {
  const condiciones = [
    ...(nombre ? [{ nombre: { equals: nombre, mode: "insensitive" as const } }] : []),
    ...(prefijo ? [{ prefijo }] : []),
  ];
  if (condiciones.length === 0) return;

  const choque = await prisma.servicio.findFirst({
    where: { sedeId, OR: condiciones, ...(ignorarId && { id: { not: ignorarId } }) },
    select: { nombre: true, prefijo: true },
  });
  if (!choque) return;
  if (prefijo && choque.prefijo === prefijo) {
    throw AppError.conflict(
      `El prefijo «${prefijo}» ya lo usa «${choque.nombre}». Cada servicio necesita una letra distinta para que el turno (${prefijo}-001) no se confunda.`,
    );
  }
  throw AppError.conflict(`Ya existe un servicio llamado «${choque.nombre}»`);
}

export const serviciosService = {
  async list(query: ListServiciosQuery, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const where = {
      sedeId,
      ...(query.activo !== undefined && { activo: query.activo }),
      ...(query.search && {
        OR: [
          { nombre: { contains: query.search, mode: "insensitive" as const } },
          { prefijo: query.search.toUpperCase() },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.servicio.findMany({
        where,
        include: INCLUIR,
        orderBy: [{ activo: "desc" }, { nombre: "asc" }], // los activos primero
        skip: skipOf(query),
        take: query.limit,
      }),
      prisma.servicio.count({ where }),
    ]);
    return { items, total };
  },

  async getById(id: string, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    return buscar(id, sedeId);
  },

  async create(input: CreateServicioInput, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    await validarNoDuplicado(sedeId, input);
    try {
      return await prisma.servicio.create({ data: { ...input, sedeId }, include: INCLUIR });
    } catch (e) {
      // Dos ADMIN guardando a la vez pasan la revisión de arriba; el índice único de la BD decide.
      if (esErrorPrisma(e, "P2002")) {
        throw AppError.conflict("Ya existe un servicio con ese nombre o prefijo");
      }
      throw e;
    }
  },

  async update(id: string, input: UpdateServicioInput, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const actual = await buscar(id, sedeId);
    await validarNoDuplicado(sedeId, input, id);

    let servicio;
    try {
      servicio = await prisma.servicio.update({ where: { id }, data: input, include: INCLUIR });
    } catch (e) {
      if (esErrorPrisma(e, "P2002")) {
        throw AppError.conflict("Ya existe un servicio con ese nombre o prefijo");
      }
      throw e;
    }

    // Avisos: lo reservado NO cambia, pero el ADMIN debe enterarse del efecto.
    const advertencias: string[] = [];
    const cambiaDuracion =
      input.duracionMin !== undefined && input.duracionMin !== actual.duracionMin;
    const cierraReservas =
      (input.activo === false && actual.activo) ||
      (input.permiteCita === false && actual.permiteCita);
    if (cambiaDuracion || cierraReservas) {
      const n = await citasVigentesFuturas(id);
      if (n > 0 && cambiaDuracion) {
        advertencias.push(
          `Hay ${plural(n)} de este servicio: conservan su hora y duración. La nueva duración (${input.duracionMin} min) solo vale para las citas nuevas.`,
        );
      }
      if (n > 0 && cierraReservas) {
        advertencias.push(
          `Hay ${plural(n)} de este servicio: siguen en la agenda, pero nadie podrá reservar más.`,
        );
      }
    }
    return { servicio, advertencias };
  },

  async remove(id: string, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    await buscar(id, sedeId);

    // Una cita o un turno apuntan a su servicio: borrarlo dejaría el historial huérfano.
    const [citas, turnos] = await Promise.all([
      prisma.cita.count({ where: { servicioId: id } }),
      prisma.turno.count({ where: { servicioId: id } }),
    ]);
    if (citas + turnos > 0) {
      throw AppError.conflict(
        `No se puede eliminar: tiene ${citas} citas y ${turnos} turnos en el historial. Desactívalo para que deje de ofrecerse.`,
      );
    }
    try {
      // Sus horarios, ventanillas asignadas y contadores se borran solos (onDelete: Cascade).
      await prisma.servicio.delete({ where: { id } });
    } catch (e) {
      // P2003 = violación de llave foránea: alguien reservó justo entre la revisión y el borrado.
      if (esErrorPrisma(e, "P2003")) {
        throw AppError.conflict(
          "El servicio acaba de recibir citas: desactívalo en lugar de eliminarlo",
        );
      }
      throw e;
    }
  },

  // Reemplaza TODO el horario semanal (ver reemplazarHorariosSchema).
  async reemplazarHorarios(id: string, input: ReemplazarHorariosInput, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const actual = await buscar(id, sedeId);

    const error = validarVentanas(input.horarios, actual.duracionMin);
    if (error) throw AppError.badRequest(error);

    // Transacción: se borra y se crea TODO junto o nada. Sin ella, un fallo a la mitad
    // dejaría el servicio sin horarios y nadie podría reservar.
    const [, , servicio] = await prisma.$transaction([
      prisma.horarioAtencion.deleteMany({ where: { servicioId: id } }),
      prisma.horarioAtencion.createMany({
        data: input.horarios.map((h) => ({ ...h, servicioId: id })),
      }),
      prisma.servicio.findFirst({ where: { id }, include: INCLUIR }),
    ]);
    // findFirst puede devolver null (en teoría, si alguien lo borró justo ahora):
    // se trata como "no encontrado" para que TypeScript sepa que de aquí en adelante existe.
    if (!servicio) throw AppError.notFound("Servicio no encontrado");
    const advertencias: string[] = [];
    const n = await citasVigentesFuturas(id);
    if (n > 0) {
      advertencias.push(
        `Hay ${plural(n)} de este servicio: conservan su hora aunque ya no caiga dentro del nuevo horario.`,
      );
    }
    return { servicio, advertencias };
  },
};
