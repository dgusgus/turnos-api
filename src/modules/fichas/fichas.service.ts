import { AppError } from "../../common/errors.js";
import { sedeDelPersonal } from "../../common/sede.js";
import { diaSemanaISO, fechaADate, hoyLocal, sumarDias } from "../../lib/time.js";
import { prisma } from "../../lib/prisma.js";
import { codigoFicha } from "../turnos/turnos.estados.js";
import type { CrearFichaInput, ListFichasQuery } from "./fichas.dto.js";

// FICHAS: números con cupo limitado por día, sin hora. Reglas que conviene entender:
//
//  · Cada servicio define cuántas fichas entrega por día (`fichasPorDia`; null = no usa fichas).
//  · Se entregan en persona: las genera el personal. Cuando el cupo de un día se llena, el sistema
//    SUGIERE la próxima fecha con cupo (saltando feriados y días sin atención) y el operador
//    confirma o elige otra.
//  · CUPO sin sobrepasarse aunque dos operadores entreguen a la vez: la transacción bloquea la
//    fila del servicio (SELECT ... FOR UPDATE), así cuentan y numeran de a uno por servicio.
//  · Cancelar una ficha libera el cupo, pero su número NO se reutiliza (no se confunden dos
//    papeles con el mismo número).
//  · El día de la ficha, la persona hace check-in y entra a la cola (ver turnos.service).

const HORIZONTE_DIAS = 60; // hasta cuántos días adelante se entregan fichas

const INCLUIR = { servicio: { select: { id: true, nombre: true, prefijo: true } } } as const;

const esErrorPrisma = (e: unknown, code: string) =>
  typeof e === "object" && e !== null && "code" in e && e.code === code;

const aISO = (d: Date) => d.toISOString().slice(0, 10);

async function servicioConFichas(servicioId: string, sedeId: string) {
  const servicio = await prisma.servicio.findFirst({
    where: { id: servicioId, sedeId, activo: true },
    include: { horarios: true },
  });
  if (!servicio) throw AppError.notFound("Servicio no encontrado");
  if (servicio.fichasPorDia == null) {
    throw AppError.conflict("Este servicio no entrega fichas. Actívalo en «Servicios y horarios».");
  }
  return { ...servicio, fichasPorDia: servicio.fichasPorDia as number };
}

type ServicioConFichas = Awaited<ReturnType<typeof servicioConFichas>>;

// Los días en que se pueden entregar fichas (con atención y sin feriado), con su cupo usado.
async function calendario(servicio: ServicioConFichas, hoy: string) {
  const fin = sumarDias(hoy, HORIZONTE_DIAS);
  const rango = { gte: fechaADate(hoy), lte: fechaADate(fin) };
  const [feriados, fichas] = await Promise.all([
    prisma.diaNoLaborable.findMany({
      where: { sedeId: servicio.sedeId, fecha: rango },
      select: { fecha: true },
    }),
    prisma.ficha.findMany({
      where: { servicioId: servicio.id, fecha: rango, estado: { not: "CANCELADA" } },
      select: { fecha: true },
    }),
  ]);

  const cerrados = new Set(feriados.map((f: { fecha: Date }) => aISO(f.fecha)));
  const usadas = new Map<string, number>();
  for (const f of fichas as { fecha: Date }[]) {
    usadas.set(aISO(f.fecha), (usadas.get(aISO(f.fecha)) ?? 0) + 1);
  }
  const diasConAtencion = new Set(servicio.horarios.map((h: { diaSemana: number }) => h.diaSemana));

  const dias: { fecha: string; cupo: number; usadas: number; libres: number }[] = [];
  for (let i = 0; i <= HORIZONTE_DIAS; i++) {
    const fecha = sumarDias(hoy, i);
    if (cerrados.has(fecha) || !diasConAtencion.has(diaSemanaISO(fecha))) continue;
    const u = usadas.get(fecha) ?? 0;
    dias.push({
      fecha,
      cupo: servicio.fichasPorDia,
      usadas: u,
      libres: Math.max(0, servicio.fichasPorDia - u),
    });
  }
  return dias;
}

export const fichasService = {
  // Servicios que entregan fichas (el operador elige entre ellos).
  async servicios(actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    return prisma.servicio.findMany({
      where: { sedeId, activo: true, fichasPorDia: { not: null } },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, prefijo: true, fichasPorDia: true },
    });
  },

  // Próximas fechas de un servicio con su cupo, y cuál se sugiere (la primera con cupo libre).
  async cupos(servicioId: string, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    const servicio = await servicioConFichas(servicioId, sedeId);
    const dias = await calendario(servicio, hoyLocal(tz));

    const idx = dias.findIndex((d) => d.libres > 0);
    return {
      servicio: {
        id: servicio.id,
        nombre: servicio.nombre,
        prefijo: servicio.prefijo,
        fichasPorDia: servicio.fichasPorDia,
      },
      // Se muestran los primeros días, y siempre hasta unos pocos después de la sugerida.
      fechas: dias.slice(0, Math.max(7, idx + 4)),
      sugerida: idx >= 0 ? (dias[idx]?.fecha ?? null) : null,
    };
  },

  // Las fichas de un día (por defecto hoy) y cuánto cupo queda por servicio.
  async list(query: ListFichasQuery, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    const fecha = query.fecha ?? hoyLocal(tz);

    const [fichas, servicios] = await Promise.all([
      prisma.ficha.findMany({
        where: {
          sedeId,
          fecha: fechaADate(fecha),
          ...(query.servicioId && { servicioId: query.servicioId }),
        },
        include: INCLUIR,
        orderBy: [{ servicio: { nombre: "asc" } }, { numero: "asc" }],
      }),
      prisma.servicio.findMany({
        where: {
          sedeId,
          activo: true,
          fichasPorDia: { not: null },
          ...(query.servicioId && { id: query.servicioId }),
        },
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true, prefijo: true, fichasPorDia: true },
      }),
    ]);

    const resumen = servicios.map(
      (s: { id: string; nombre: string; prefijo: string; fichasPorDia: number | null }) => {
        const cupo = s.fichasPorDia ?? 0;
        const usadas = fichas.filter(
          (f: { servicio: { id: string }; estado: string }) =>
            f.servicio.id === s.id && f.estado !== "CANCELADA",
        ).length;
        return {
          servicioId: s.id,
          nombre: s.nombre,
          prefijo: s.prefijo,
          cupo,
          usadas,
          libres: Math.max(0, cupo - usadas),
        };
      },
    );
    return { fecha, fichas, resumen };
  },

  async crear(input: CrearFichaInput, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    const servicio = await servicioConFichas(input.servicioId, sedeId);
    const dias = await calendario(servicio, hoyLocal(tz));

    const fecha = input.fecha ?? dias.find((d) => d.libres > 0)?.fecha;
    if (!fecha) {
      throw AppError.conflict(
        `No hay fichas disponibles en los próximos ${HORIZONTE_DIAS} días para este servicio.`,
      );
    }
    const dia = dias.find((d) => d.fecha === fecha);
    if (!dia) {
      throw AppError.badRequest(
        `Esa fecha no sirve: debe ser un día de atención desde hoy hasta dentro de ${HORIZONTE_DIAS} días.`,
      );
    }
    if (dia.libres === 0) {
      throw AppError.conflict(
        `Ya no hay fichas para el ${fecha} (cupo de ${dia.cupo}). Elige otra fecha.`,
      );
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Bloquea la fila del servicio hasta terminar: otro operador entregando fichas del MISMO
        // servicio espera aquí, y cuando le toque verá el cupo y el número ya actualizados.
        await tx.$queryRaw`SELECT id FROM "servicios" WHERE id = ${servicio.id} FOR UPDATE`;

        const usadas = await tx.ficha.count({
          where: {
            servicioId: servicio.id,
            fecha: fechaADate(fecha),
            estado: { not: "CANCELADA" },
          },
        });
        if (usadas >= servicio.fichasPorDia) {
          throw AppError.conflict(`Se acabaron las fichas para el ${fecha}. Elige otra fecha.`);
        }
        const ultima = await tx.ficha.findFirst({
          where: { servicioId: servicio.id, fecha: fechaADate(fecha) },
          orderBy: { numero: "desc" },
          select: { numero: true },
        });
        const numero = (ultima?.numero ?? 0) + 1;

        return tx.ficha.create({
          data: {
            sedeId,
            servicioId: servicio.id,
            fecha: fechaADate(fecha),
            numero,
            codigo: codigoFicha(servicio.prefijo, numero),
            nombre: input.nombre,
            documento: input.documento,
            telefono: input.telefono,
            referencia: input.referencia,
            emitidaPorId: actorId,
          },
          include: INCLUIR,
        });
      });
    } catch (e) {
      if (esErrorPrisma(e, "P2002"))
        throw AppError.conflict("Intenta de nuevo: otra ficha se entregó a la vez.");
      throw e;
    }
  },

  async cancelar(id: string, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const ficha = await prisma.ficha.findFirst({ where: { id, sedeId }, include: INCLUIR });
    if (!ficha) throw AppError.notFound("Ficha no encontrada");
    if (ficha.estado !== "ACTIVA") {
      throw AppError.conflict(
        `No se puede cancelar la ficha ${ficha.codigo}: está ${ficha.estado}`,
      );
    }
    const { count } = await prisma.ficha.updateMany({
      where: { id, estado: "ACTIVA" },
      data: { estado: "CANCELADA", canceladaEn: new Date() },
    });
    if (count === 0) throw AppError.conflict("La ficha cambió de estado. Actualiza la lista.");
    return { ...ficha, estado: "CANCELADA" };
  },
};
