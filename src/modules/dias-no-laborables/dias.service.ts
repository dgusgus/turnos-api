import { AppError } from "../../common/errors.js";
import { skipOf } from "../../common/pagination.js";
import { sedeDelPersonal } from "../../common/sede.js";
import { fechaADate, hoyLocal, limitesDelDia } from "../../lib/time.js";
import { prisma } from "../../lib/prisma.js";
import { ESTADOS_VIGENTES } from "../citas/citas.estados.js";
import type { CreateDiaInput, ListDiasQuery } from "./dias.dto.js";

const esErrorPrisma = (e: unknown, code: string) =>
  typeof e === "object" && e !== null && "code" in e && e.code === code;

export const diasService = {
  async list(query: ListDiasQuery, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    // `fecha` es una columna @db.Date (sin hora): se compara con medianoche UTC de esa fecha.
    const where = { sedeId, fecha: { gte: fechaADate(query.desde ?? hoyLocal(tz)) } };

    const [items, total] = await prisma.$transaction([
      prisma.diaNoLaborable.findMany({
        where,
        orderBy: { fecha: "asc" },
        skip: skipOf(query),
        take: query.limit,
      }),
      prisma.diaNoLaborable.count({ where }),
    ]);
    return { items, total };
  },

  async create(input: CreateDiaInput, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    let dia;
    try {
      dia = await prisma.diaNoLaborable.create({
        data: { sedeId, fecha: fechaADate(input.fecha), motivo: input.motivo },
      });
    } catch (e) {
      // @@unique([sedeId, fecha]): un día solo se marca una vez.
      if (esErrorPrisma(e, "P2002"))
        throw AppError.conflict("Ese día ya está marcado como no laborable");
      throw e;
    }

    // Marcar un día NO cancela las citas que ya existían: el operador decide qué hacer con ellas
    // (rechazarlas con un motivo claro desde la bandeja). Aquí solo se avisa cuántas son.
    const { desde, hasta } = limitesDelDia(input.fecha, tz);
    const n = await prisma.cita.count({
      where: { sedeId, inicio: { gte: desde, lt: hasta }, estado: { in: ESTADOS_VIGENTES } },
    });
    const advertencias =
      n > 0
        ? [
            `Ese día ya hay ${n === 1 ? "1 cita vigente" : `${n} citas vigentes`}. No se cancelan solas: rechácelas desde la bandeja de Citas con el motivo.`,
          ]
        : [];
    return { dia, advertencias };
  },

  async remove(id: string, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const dia = await prisma.diaNoLaborable.findFirst({ where: { id, sedeId } });
    if (!dia) throw AppError.notFound("Día no encontrado");
    await prisma.diaNoLaborable.delete({ where: { id } });
  },
};
