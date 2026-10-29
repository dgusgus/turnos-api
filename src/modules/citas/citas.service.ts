import { AppError } from "../../common/errors.js";
import { skipOf } from "../../common/pagination.js";
import { hoyLocal, limitesDelDia } from "../../lib/time.js";
import { prisma } from "../../lib/prisma.js";
import type { ListCitasQuery } from "./citas.dto.js";
import { puedeAprobar, puedeRechazar, type EstadoCita } from "./citas.estados.js";
import { liberarPendientesVencidas } from "./citas.vencimiento.js";

const incluir = {
  servicio: { select: { id: true, nombre: true, prefijo: true } },
  solicitante: { select: { documento: true } },
} as const;

// Citas vistas por el PERSONAL (ADMIN/OPERADOR): bandeja, aprobar, rechazar.
// La parte pública (reservar, agenda, consultar) está en modules/public.
export const citasService = {
  // Sede y zona horaria del usuario que consulta. Un usuario con sede solo ve su sede;
  // un ADMIN sin sede ve todas.
  async contexto(actorId: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: actorId },
      select: { activo: true, sedeId: true, sede: { select: { zonaHoraria: true } } },
    });
    if (!usuario || !usuario.activo) throw AppError.unauthorized("Sesión inválida");
    if (usuario.sedeId && usuario.sede) {
      return { sedeId: usuario.sedeId, tz: usuario.sede.zonaHoraria };
    }
    const sede = await prisma.sede.findFirst({
      where: { activa: true },
      orderBy: { creadoEn: "asc" },
      select: { zonaHoraria: true },
    });
    return { sedeId: null, tz: sede?.zonaHoraria ?? "America/La_Paz" };
  },

  // Sin `fecha` devuelve las citas de hoy en adelante (incluye las pendientes futuras).
  async list(query: ListCitasQuery, actorId: string) {
    await liberarPendientesVencidas();
    const { sedeId, tz } = await this.contexto(actorId);

    const rango = query.fecha
      ? limitesDelDia(query.fecha, tz)
      : { desde: limitesDelDia(hoyLocal(tz), tz).desde, hasta: undefined };

    const buscar = query.search;
    const where = {
      ...(sedeId && { sedeId }),
      ...(query.estado && { estado: query.estado }),
      inicio: { gte: rango.desde, ...(rango.hasta && { lt: rango.hasta }) },
      ...(buscar && {
        OR: [
          { codigoPublico: { contains: buscar, mode: "insensitive" as const } },
          { nombres: { contains: buscar, mode: "insensitive" as const } },
          { apellidos: { contains: buscar, mode: "insensitive" as const } },
          { telefono: { contains: buscar } },
          { solicitante: { documento: { contains: buscar.toUpperCase() } } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.cita.findMany({
        where,
        include: incluir,
        orderBy: { inicio: "asc" },
        skip: skipOf(query),
        take: query.limit,
      }),
      prisma.cita.count({ where }),
    ]);
    return { items, total };
  },

  async cargar(id: string, sedeId: string | null) {
    const cita = await prisma.cita.findFirst({
      where: { id, ...(sedeId && { sedeId }) },
      include: incluir,
    });
    if (!cita) throw AppError.notFound("Cita no encontrada");
    return cita;
  },

  // PENDIENTE → CONFIRMADA
  async aprobar(id: string, actorId: string) {
    await liberarPendientesVencidas();
    const { sedeId } = await this.contexto(actorId);
    const cita = await this.cargar(id, sedeId);
    if (!puedeAprobar(cita.estado as EstadoCita)) {
      throw AppError.conflict("Solo se pueden aprobar citas pendientes");
    }

    const ahora = new Date();
    // `estado: PENDIENTE` en el where: si otro operador la decidió un instante antes, no pisa su decisión.
    const { count } = await prisma.cita.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: { estado: "CONFIRMADA", decididaPorId: actorId, decididaEn: ahora },
    });
    if (count === 0) throw AppError.conflict("La cita ya fue atendida por otro operador");
    return { ...cita, estado: "CONFIRMADA", decididaEn: ahora };
  },

  // PENDIENTE o CONFIRMADA → RECHAZADA (con motivo; lo lee quien reservó)
  async rechazar(id: string, motivo: string, actorId: string) {
    await liberarPendientesVencidas();
    const { sedeId } = await this.contexto(actorId);
    const cita = await this.cargar(id, sedeId);
    if (!puedeRechazar(cita.estado as EstadoCita)) {
      throw AppError.conflict("Solo se pueden rechazar citas pendientes o confirmadas");
    }

    const ahora = new Date();
    const { count } = await prisma.cita.updateMany({
      where: { id, estado: { in: ["PENDIENTE", "CONFIRMADA"] } },
      data: {
        estado: "RECHAZADA",
        motivoRechazo: motivo,
        decididaPorId: actorId,
        decididaEn: ahora,
      },
    });
    if (count === 0) throw AppError.conflict("La cita cambió de estado, vuelve a cargar la lista");
    return { ...cita, estado: "RECHAZADA", motivoRechazo: motivo, decididaEn: ahora };
  },
};
