import { AppError } from "../../common/errors.js";
import { sedeDelPersonal } from "../../common/sede.js";
import { emitirCola } from "../../lib/eventos.js";
import { fechaADate, hoyLocal } from "../../lib/time.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import type { CrearTurnoInput, LlamarInput, ListTurnosQuery } from "./turnos.dto.js";
import {
  codigoTurno,
  ESTADOS_ACTIVOS,
  ESTADOS_EN_VENTANILLA,
  leerCodigoFicha,
  ORDEN_DE_ATENCION,
  TEXTO_ACCION,
  TRANSICIONES,
  type Accion,
  type PrioridadTurno,
} from "./turnos.estados.js";

// LA COLA. Reglas que conviene entender:
//
//  · Todo es "de hoy" y de la sede del personal. El número del turno se reinicia cada día.
//  · NUMERACIÓN sin repetidos: un contador por (servicio, día) que se incrementa DENTRO de una
//    transacción. Dos operadores sacando turno a la vez nunca reciben el mismo número.
//  · ORDEN DE ATENCIÓN: prioridad (preferencial → cita/ficha → normal); dentro de ella, las fichas
//    por su número y el resto por orden de llegada (ver ORDEN_DE_ATENCION). El orden de las
//    prioridades es el del enum en schema.prisma (PostgreSQL ordena los enum por su declaración).
//  · CARRERAS: dos operadores pulsando «Llamar siguiente» a la vez no deben tomar el mismo turno.
//    Cada cambio de estado es un UPDATE condicionado («solo si sigue ESPERANDO»): si count = 0,
//    otro se adelantó. Esto se llama bloqueo optimista.

const INCLUIR = {
  servicio: { select: { id: true, nombre: true, prefijo: true } },
  ventanilla: { select: { id: true, nombre: true } },
  cita: {
    select: {
      codigoPublico: true,
      nombres: true,
      apellidos: true,
      estudianteNombre: true,
      inicio: true,
    },
  },
  ficha: { select: { codigo: true } },
} as const;

const esConflictoUnico = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && e.code === "P2002";

interface NuevoTurno {
  sedeId: string;
  servicio: { id: string; prefijo: string };
  fecha: Date;
  prioridad: PrioridadTurno;
  origen: "MOSTRADOR" | "CITA" | "FICHA";
  citaId?: string;
  fichaId?: string;
  numeroFicha?: number;
  solicitanteId?: string;
  nombreVisitante?: string | null;
  estudianteReferencia?: string | null;
  observacion?: string | null;
}

// Crea el turno con su número. `tx` = la transacción en curso (la comparte el check-in).
async function crearConNumero(tx: Prisma.TransactionClient, t: NuevoTurno) {
  // upsert + increment: si no hay contador de hoy lo crea en 1; si existe, suma 1. Es atómico.
  const contador = await tx.contadorTurno.upsert({
    where: { servicioId_fecha: { servicioId: t.servicio.id, fecha: t.fecha } },
    create: { servicioId: t.servicio.id, fecha: t.fecha, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return tx.turno.create({
    data: {
      sedeId: t.sedeId,
      servicioId: t.servicio.id,
      fecha: t.fecha,
      numero: contador.ultimo,
      codigo: codigoTurno(t.servicio.prefijo, contador.ultimo),
      prioridad: t.prioridad,
      origen: t.origen,
      citaId: t.citaId,
      fichaId: t.fichaId,
      numeroFicha: t.numeroFicha,
      solicitanteId: t.solicitanteId,
      nombreVisitante: t.nombreVisitante,
      estudianteReferencia: t.estudianteReferencia,
      observacion: t.observacion,
    },
    include: INCLUIR,
  });
}

// Si dos peticiones crean el contador por primera vez a la vez, una choca (P2002): se reintenta.
async function conReintento<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await fn();
    } catch (e) {
      if (!esConflictoUnico(e) || intento >= 3) throw e;
    }
  }
}

async function buscar(id: string, sedeId: string) {
  const turno = await prisma.turno.findFirst({ where: { id, sedeId }, include: INCLUIR });
  if (!turno) throw AppError.notFound("Turno no encontrado");
  return turno;
}

// Check-in de una FICHA: debe ser de hoy y estar ACTIVA. Mismo molde que el de la cita.
async function checkinFicha(
  { prefijo, numero }: { prefijo: string; numero: number },
  sedeId: string,
  tz: string,
) {
  const hoy = hoyLocal(tz);
  const ficha = await prisma.ficha.findFirst({
    where: { sedeId, numero, servicio: { prefijo, sedeId }, fecha: { lte: fechaADate(hoy) } },
    orderBy: { fecha: "desc" }, // la más reciente con ese código (las viejas no cuentan)
    include: { servicio: { select: { id: true, prefijo: true } } },
  });
  if (!ficha) throw AppError.notFound("No hay ninguna ficha con ese código");

  const diaFicha = ficha.fecha.toISOString().slice(0, 10);
  if (diaFicha !== hoy) throw AppError.conflict(`Esta ficha era para el ${diaFicha}: ya venció`);
  if (ficha.estado === "EN_COLA") throw AppError.conflict("Esta ficha ya hizo check-in");
  if (ficha.estado !== "ACTIVA") {
    throw AppError.conflict(`No se puede hacer check-in: la ficha está ${ficha.estado}`);
  }

  return conReintento(() =>
    prisma.$transaction(async (tx) => {
      // Reclamar la ficha: solo pasa si SIGUE activa (dos operadores a la vez: uno gana).
      const { count } = await tx.ficha.updateMany({
        where: { id: ficha.id, estado: "ACTIVA" },
        data: { estado: "EN_COLA" },
      });
      if (count === 0) throw AppError.conflict("Esta ficha ya hizo check-in");

      return crearConNumero(tx, {
        sedeId,
        servicio: ficha.servicio,
        fecha: fechaADate(hoy),
        prioridad: "CITA",
        origen: "FICHA",
        fichaId: ficha.id,
        numeroFicha: ficha.numero,
        nombreVisitante: ficha.nombre,
        estudianteReferencia: ficha.referencia,
      });
    }),
  );
}

const base = {
  // La cola de hoy, en el orden en que se atenderá.
  async list(query: ListTurnosQuery, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    return prisma.turno.findMany({
      where: {
        sedeId,
        fecha: fechaADate(hoyLocal(tz)),
        ...(query.servicioId && { servicioId: query.servicioId }),
        ...(query.vista === "activos" && { estado: { in: ESTADOS_ACTIVOS } }),
      },
      include: INCLUIR,
      orderBy: [...ORDEN_DE_ATENCION],
    });
  },

  // Turno de mostrador: el operador lo genera para quien llega sin cita.
  async crear(input: CrearTurnoInput, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    const servicio = await prisma.servicio.findFirst({
      where: { id: input.servicioId, sedeId, activo: true },
      select: { id: true, prefijo: true },
    });
    if (!servicio) throw AppError.notFound("Servicio no disponible");

    const fecha = fechaADate(hoyLocal(tz));
    return conReintento(() =>
      prisma.$transaction((tx) =>
        crearConNumero(tx, {
          sedeId,
          servicio,
          fecha,
          prioridad: input.prioridad,
          origen: "MOSTRADOR",
          nombreVisitante: input.nombreVisitante,
          estudianteReferencia: input.estudianteReferencia,
          observacion: input.observacion,
        }),
      ),
    );
  },

  // Check-in: convierte una cita CONFIRMADA o una ficha de HOY en un turno (prioridad CITA) y la
  // pasa a EN_COLA. El código dice cuál es: "P-F012" es una ficha; "R-K7M2Q", una cita.
  async checkin(codigo: string, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    const deFicha = leerCodigoFicha(codigo);
    if (deFicha) return checkinFicha(deFicha, sedeId, tz);

    const cita = await prisma.cita.findFirst({
      where: { codigoPublico: codigo, sedeId },
      include: { servicio: { select: { id: true, prefijo: true } } },
    });
    if (!cita) throw AppError.notFound("No hay ninguna cita con ese código");

    if (cita.estado === "EN_COLA") throw AppError.conflict("Esta cita ya hizo check-in");
    if (cita.estado === "PENDIENTE") {
      throw AppError.conflict("La cita todavía no fue aprobada: apruébala primero en «Citas»");
    }
    if (cita.estado !== "CONFIRMADA") {
      throw AppError.conflict(`No se puede hacer check-in: la cita está ${cita.estado}`);
    }

    // La cita debe ser para HOY (en la zona horaria del colegio).
    const hoy = hoyLocal(tz);
    const diaCita = hoyLocal(tz, cita.inicio);
    if (diaCita !== hoy) {
      throw AppError.conflict(`Esta cita es para el ${diaCita}, no para hoy`);
    }

    return conReintento(() =>
      prisma.$transaction(async (tx) => {
        // 1) Reclamar la cita: solo pasa si SIGUE confirmada. Si dos operadores hacen
        //    check-in a la vez, uno obtiene count = 1 y el otro 0.
        const { count } = await tx.cita.updateMany({
          where: { id: cita.id, estado: "CONFIRMADA" },
          data: { estado: "EN_COLA" },
        });
        if (count === 0) throw AppError.conflict("Esta cita ya hizo check-in");

        // 2) Crear el turno. Si algo falla aquí, el paso 1 se deshace (es una transacción).
        return crearConNumero(tx, {
          sedeId,
          servicio: cita.servicio,
          fecha: fechaADate(hoy),
          prioridad: "CITA",
          origen: "CITA",
          citaId: cita.id,
          solicitanteId: cita.solicitanteId,
        });
      }),
    );
  },

  // «Llamar siguiente» desde una ventanilla.
  async llamarSiguiente(input: LlamarInput, actorId: string) {
    const { sedeId, tz } = await sedeDelPersonal(actorId);
    const ventanilla = await prisma.ventanilla.findFirst({
      where: { id: input.ventanillaId, sedeId, activa: true },
      include: { servicios: { select: { servicioId: true } } },
    });
    if (!ventanilla) throw AppError.notFound("Ventanilla no encontrada");

    const permitidos: string[] = ventanilla.servicios.map(
      (s: { servicioId: string }) => s.servicioId,
    );
    if (input.servicioId && !permitidos.includes(input.servicioId)) {
      throw AppError.badRequest("Esa ventanilla no atiende ese servicio");
    }
    const servicios = input.servicioId ? [input.servicioId] : permitidos;
    const fecha = fechaADate(hoyLocal(tz));

    // Una ventanilla atiende a UNA persona a la vez.
    const ocupada = await prisma.turno.findFirst({
      where: { ventanillaId: ventanilla.id, fecha, estado: { in: ESTADOS_EN_VENTANILLA } },
      select: { codigo: true },
    });
    if (ocupada) {
      throw AppError.conflict(`Termina primero el turno ${ocupada.codigo} de esta ventanilla`);
    }

    // Se intenta hasta 3 veces: si otro operador se lleva el mismo turno justo antes, se prueba el siguiente.
    for (let intento = 0; intento < 3; intento++) {
      const siguiente = await prisma.turno.findFirst({
        where: { sedeId, fecha, estado: "ESPERANDO", servicioId: { in: servicios } },
        orderBy: [...ORDEN_DE_ATENCION],
        select: { id: true },
      });
      if (!siguiente) throw AppError.notFound("No hay turnos esperando");

      const { count } = await prisma.turno.updateMany({
        where: { id: siguiente.id, estado: "ESPERANDO" }, // ← el candado: sigue esperando
        data: {
          estado: "LLAMADO",
          ventanillaId: ventanilla.id,
          atendidoPorId: actorId,
          llamadoEn: new Date(),
        },
      });
      if (count === 1) return buscar(siguiente.id, sedeId);
    }
    throw AppError.conflict("La cola cambió mientras llamabas. Intenta de nuevo.");
  },

  // iniciar / finalizar / noSePresento / cancelar: todas siguen el mismo molde (ver TRANSICIONES).
  async cambiarEstado(id: string, accion: Accion, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const turno = await buscar(id, sedeId);
    const t = TRANSICIONES[accion];

    if (turno.estado !== t.desde) {
      throw AppError.conflict(
        `No se puede ${TEXTO_ACCION[accion]} el turno ${turno.codigo}: está ${turno.estado}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.turno.updateMany({
        where: { id, estado: t.desde },
        data: {
          estado: t.a,
          atendidoPorId: actorId,
          ...(t.marca && { [t.marca]: new Date() }),
        },
      });
      if (count === 0) throw AppError.conflict("El turno cambió de estado. Actualiza la pantalla.");

      // Si el turno nació de una cita, la cita también cierra su ciclo (atendida / no asistió).
      if (t.cierre && turno.citaId) {
        await tx.cita.update({ where: { id: turno.citaId }, data: { estado: t.cierre } });
      }
      // Igual con la ficha de origen.
      if (t.cierre && turno.fichaId) {
        await tx.ficha.update({ where: { id: turno.fichaId }, data: { estado: t.cierre } });
      }
    });
    return buscar(id, sedeId);
  },

  // «Volver a llamar»: la persona no apareció. Solo renueva la hora del llamado; la pantalla
  // detecta el cambio de `llamadoEn` y vuelve a sonar.
  async rellamar(id: string, actorId: string) {
    const { sedeId } = await sedeDelPersonal(actorId);
    const turno = await buscar(id, sedeId);
    if (turno.estado !== "LLAMADO") {
      throw AppError.conflict(
        `Solo se puede volver a llamar un turno llamado: ${turno.codigo} está ${turno.estado}`,
      );
    }
    const { count } = await prisma.turno.updateMany({
      where: { id, estado: "LLAMADO" },
      data: { llamadoEn: new Date() },
    });
    if (count === 0) throw AppError.conflict("El turno cambió de estado. Actualiza la pantalla.");
    return buscar(id, sedeId);
  },
};

// Tras CUALQUIER cambio en la cola se avisa a las pantallas conectadas (ver lib/eventos.ts).
// En vez de repetir `emitirCola(...)` en cada método, se "envuelve" cada uno: ejecuta el original
// y, si salió bien, avisa. Si el original lanza un error, no se avisa (no hubo cambio).
const avisando =
  <A extends unknown[], R extends { sedeId: string }>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    const turno = await fn(...args);
    emitirCola(turno.sedeId);
    return turno;
  };

export const turnosService = {
  list: base.list,
  crear: avisando(base.crear),
  checkin: avisando(base.checkin),
  llamarSiguiente: avisando(base.llamarSiguiente),
  cambiarEstado: avisando(base.cambiarEstado),
  rellamar: avisando(base.rellamar),
};
