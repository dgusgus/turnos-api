import { AppError } from "../../common/errors.js";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { generarCodigoCita, generarToken, hashToken } from "../../lib/tokens.js";
import {
  diaSemanaISO,
  fechaADate,
  hoyLocal,
  limitesDelDia,
  localAUtc,
  minAHora,
  partesLocales,
  sumarDias,
} from "../../lib/time.js";
import {
  ESTADOS_AGENDA_ACTIVAS,
  ESTADOS_OCUPAN,
  ESTADOS_VIGENTES,
  puedeCancelar,
  type EstadoCita,
} from "../citas/citas.estados.js";
import { generarFranjas } from "../citas/citas.franjas.js";
import { toAgendaItemDto, toConsultaDto, toSeguimientoDto } from "../citas/citas.mapper.js";
import { liberarPendientesVencidas } from "../citas/citas.vencimiento.js";
import type { AgendaQuery, ConsultaInput, CrearCitaInput } from "./public.dto.js";

// Todo lo que puede hacer una persona SIN iniciar sesión. Por eso cada función:
//  - valida contra las reglas del negocio (no confía en lo que mande el cliente),
//  - devuelve solo datos "públicos" (ver citas.mapper.ts),
//  - responde igual si algo no existe o no coincide (no revela si un CI está registrado).

const SERVICIO_RESUMEN = { select: { nombre: true, prefijo: true } } as const;

const esConflictoUnico = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && e.code === "P2002";

async function cargarServicioParaCitas(servicioId: string, sedeId?: string) {
  const servicio = await prisma.servicio.findFirst({
    where: {
      id: servicioId,
      activo: true,
      permiteCita: true,
      sede: { activa: true },
      ...(sedeId && { sedeId }), // el personal solo agenda en SU sede
    },
    include: { sede: { select: { id: true, nombre: true, zonaHoraria: true } }, horarios: true },
  });
  if (!servicio) throw AppError.notFound("Este servicio no está disponible para citas");
  return servicio;
}

type ServicioConHorarios = Awaited<ReturnType<typeof cargarServicioParaCitas>>;

// Solo se puede reservar desde hoy hasta CITA_MAX_DIAS_ANTICIPACION días adelante.
function validarRango(fecha: string, tz: string, ahora: Date) {
  const hoy = hoyLocal(tz, ahora);
  if (fecha < hoy || fecha > sumarDias(hoy, env.CITA_MAX_DIAS_ANTICIPACION)) {
    throw AppError.badRequest(
      `Solo puedes reservar desde hoy hasta dentro de ${env.CITA_MAX_DIAS_ANTICIPACION} días`,
    );
  }
}

// Las franjas del día: horarios del servicio ese día de la semana, salvo feriados.
async function franjasDelDia(servicio: ServicioConHorarios, fecha: string) {
  const feriado = await prisma.diaNoLaborable.findUnique({
    where: { sedeId_fecha: { sedeId: servicio.sedeId, fecha: fechaADate(fecha) } },
  });
  if (feriado) return { franjas: [], cerrado: feriado.motivo };

  const dia = diaSemanaISO(fecha);
  const franjas = generarFranjas(
    servicio.horarios.filter((h: { diaSemana: number }) => h.diaSemana === dia),
    servicio.duracionMin,
  );
  return { franjas, cerrado: franjas.length === 0 ? "Sin atención ese día" : null };
}

async function buscarPorToken(token: string) {
  const cita = await prisma.cita.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { servicio: SERVICIO_RESUMEN },
  });
  if (!cita) throw AppError.notFound("No encontramos esa cita. Revisa el enlace.");
  return cita;
}

export const publicService = {
  // Servicios que se pueden reservar (el frontend los muestra al elegir).
  async servicios() {
    return prisma.servicio.findMany({
      where: { activo: true, permiteCita: true, sede: { activa: true } },
      orderBy: [{ sedeId: "asc" }, { nombre: "asc" }],
      include: { sede: { select: { id: true, nombre: true } } },
    });
  },

  // Franjas de un día con su estado libre/ocupada. NO dice de quién es cada cita.
  async disponibilidad(servicioId: string, fecha: string, ahora = new Date()) {
    await liberarPendientesVencidas(ahora);
    const servicio = await cargarServicioParaCitas(servicioId);
    const tz = servicio.sede.zonaHoraria;
    validarRango(fecha, tz, ahora);

    const { franjas, cerrado } = await franjasDelDia(servicio, fecha);
    const { desde, hasta } = limitesDelDia(fecha, tz);
    const ocupadas = await prisma.cita.findMany({
      where: { servicioId, inicio: { gte: desde, lt: hasta }, estado: { in: ESTADOS_OCUPAN } },
      select: { inicio: true },
    });
    const ocupadasMs = new Set(ocupadas.map((c) => c.inicio.getTime()));
    const minimoMs = ahora.getTime() + env.CITA_MIN_ANTICIPACION_MIN * 60_000;

    return {
      servicio: {
        id: servicio.id,
        nombre: servicio.nombre,
        duracionMin: servicio.duracionMin,
        requiereAprobacion: servicio.requiereAprobacion,
      },
      fecha,
      cerrado,
      franjas: franjas.map((f) => {
        const inicio = localAUtc(fecha, f.inicioMin, tz);
        return {
          hora: minAHora(f.inicioMin),
          inicio: inicio.toISOString(),
          fin: localAUtc(fecha, f.finMin, tz).toISOString(),
          libre: !ocupadasMs.has(inicio.getTime()) && inicio.getTime() >= minimoMs,
        };
      }),
    };
  },

  // Reservar. El estado inicial depende del servicio: CONFIRMADA o PENDIENTE (aprobación).
  //
  // `personal` = la cita la crea alguien del personal (autenticado) a nombre de una persona.
  // Es personal autorizado, así que: (1) NO le aplica el tope de citas vigentes por persona
  // (ese límite frena el abuso del público, no al personal), y (2) la cita nace CONFIRMADA sin
  // pasar por aprobación (quien la crea ya es quien aprueba). El resto de reglas SÍ aplican:
  // la hora debe existir y estar libre, y no puede ser en feriado ni fuera del horario.
  async crear(
    input: CrearCitaInput,
    ahora = new Date(),
    personal?: { sedeId: string; actorId: string },
  ) {
    await liberarPendientesVencidas(ahora);
    const servicio = await cargarServicioParaCitas(input.servicioId, personal?.sedeId);
    const tz = servicio.sede.zonaHoraria;

    // 1) La hora pedida debe ser EXACTAMENTE una franja válida (no confiamos en el cliente).
    const pedida = partesLocales(new Date(input.inicio), tz);
    validarRango(pedida.fecha, tz, ahora);
    const { franjas } = await franjasDelDia(servicio, pedida.fecha);
    const franja = franjas.find((f) => f.inicioMin === pedida.min);
    if (!franja) throw AppError.badRequest("Ese horario no existe para el servicio elegido");

    const inicio = localAUtc(pedida.fecha, franja.inicioMin, tz);
    const fin = localAUtc(pedida.fecha, franja.finMin, tz);
    if (inicio.getTime() < ahora.getTime() + env.CITA_MIN_ANTICIPACION_MIN * 60_000) {
      throw AppError.badRequest("Ya no se puede reservar ese horario, elige uno más adelante");
    }

    // 2) Límite por persona (CI o teléfono): frena que el PÚBLICO acapare horarios. No aplica al personal.
    if (!personal) {
      const vigentes = await prisma.cita.count({
        where: {
          estado: { in: ESTADOS_VIGENTES },
          inicio: { gte: ahora },
          OR: [{ solicitante: { documento: input.documento } }, { telefono: input.telefono }],
        },
      });
      if (vigentes >= env.CITA_MAX_ACTIVAS) {
        throw AppError.conflict(
          `Ya tienes ${vigentes} citas vigentes (máximo ${env.CITA_MAX_ACTIVAS}). Cancela una o espera a ser atendido.`,
        );
      }
    }

    // 3) ¿Alguien tomó la hora? (la BD lo garantiza igual con el índice único parcial)
    const horaOcupada = () =>
      prisma.cita.findFirst({
        where: { servicioId: servicio.id, inicio, estado: { in: ESTADOS_OCUPAN } },
        select: { id: true },
      });
    if (await horaOcupada()) throw AppError.conflict("Ese horario ya fue reservado, elige otro");

    // 4) Ficha de la persona (por CI). Si ya existe NO se pisa: ver comentario en Cita.
    const solicitante = await prisma.solicitante.upsert({
      where: { documento: input.documento },
      update: {},
      create: {
        documento: input.documento,
        nombres: input.nombres,
        apellidos: input.apellidos,
        telefono: input.telefono,
      },
    });

    const estado: EstadoCita =
      servicio.requiereAprobacion && !personal ? "PENDIENTE" : "CONFIRMADA";

    // 5) Crear. Si falla por duplicado hay dos causas: otra persona ganó la hora
    //    (error al usuario) o el código corto chocó por azar (se reintenta con otro).
    for (let intento = 0; intento < 4; intento++) {
      const token = generarToken();
      try {
        const cita = await prisma.cita.create({
          data: {
            codigoPublico: generarCodigoCita(),
            tokenHash: hashToken(token),
            sedeId: servicio.sedeId,
            servicioId: servicio.id,
            solicitanteId: solicitante.id,
            inicio,
            fin,
            estado,
            nombres: input.nombres,
            apellidos: input.apellidos,
            telefono: input.telefono,
            estudianteNombre: input.estudianteNombre,
            estudianteCurso: input.estudianteCurso,
            motivo: input.motivo,
            decididaEn: estado === "CONFIRMADA" ? ahora : null,
            ...(personal && { decididaPorId: personal.actorId }),
          },
          include: { servicio: SERVICIO_RESUMEN },
        });
        // El token se devuelve UNA sola vez: en la BD solo queda su hash.
        return { token, cita: toSeguimientoDto(cita) };
      } catch (e) {
        if (!esConflictoUnico(e)) throw e;
        if (await horaOcupada()) {
          throw AppError.conflict("Ese horario acaba de ser reservado por otra persona");
        }
      }
    }
    throw AppError.conflict("No se pudo completar la reserva, intenta de nuevo");
  },

  // "Mi cita" con el enlace secreto.
  async porToken(token: string) {
    await liberarPendientesVencidas();
    return toSeguimientoDto(await buscarPorToken(token));
  },

  // "Mi cita" para quien perdió el enlace: código + CI. Muestra menos que el enlace
  // y NO permite cancelar (el código aparece en la agenda pública y el CI no es secreto).
  async consultar({ codigo, documento }: ConsultaInput) {
    await liberarPendientesVencidas();
    const cita = await prisma.cita.findFirst({
      where: { codigoPublico: codigo, solicitante: { documento } },
      include: { servicio: SERVICIO_RESUMEN },
    });
    // Mismo error si el código no existe o el CI no coincide.
    if (!cita) throw AppError.notFound("No encontramos una cita con esos datos");
    return toConsultaDto(cita);
  },

  async cancelar(token: string, ahora = new Date()) {
    await liberarPendientesVencidas(ahora);
    const cita = await buscarPorToken(token);
    if (!puedeCancelar(cita.estado as EstadoCita) || cita.inicio.getTime() <= ahora.getTime()) {
      throw AppError.conflict("Esta cita ya no se puede cancelar");
    }
    const { count } = await prisma.cita.updateMany({
      where: { id: cita.id, estado: { in: ESTADOS_VIGENTES } },
      data: { estado: "CANCELADA", canceladaEn: ahora },
    });
    if (count === 0) throw AppError.conflict("Esta cita ya no se puede cancelar");
    return toSeguimientoDto({ ...cita, estado: "CANCELADA" });
  },

  // Agenda del día para cualquiera: sirve para ver horarios ocupados, el estado de las
  // citas y las rechazadas. Solo código, hora, servicio, estado y "J. Mamani".
  async agenda({ fecha, sedeId, servicioId }: AgendaQuery) {
    await liberarPendientesVencidas();
    const sede = await prisma.sede.findFirst({
      where: { activa: true, ...(sedeId && { id: sedeId }) },
      orderBy: { creadoEn: "asc" },
      select: { id: true, nombre: true, zonaHoraria: true },
    });
    if (!sede) throw AppError.notFound("Sede no encontrada");

    const dia = fecha ?? hoyLocal(sede.zonaHoraria);
    const { desde, hasta } = limitesDelDia(dia, sede.zonaHoraria);
    const citas = await prisma.cita.findMany({
      where: {
        sedeId: sede.id,
        ...(servicioId && { servicioId }),
        inicio: { gte: desde, lt: hasta },
        estado: { in: [...ESTADOS_AGENDA_ACTIVAS, "RECHAZADA"] },
      },
      include: { servicio: SERVICIO_RESUMEN },
      orderBy: { inicio: "asc" },
      take: 500,
    });

    return {
      fecha: dia,
      sede: { id: sede.id, nombre: sede.nombre },
      activas: citas.filter((c) => c.estado !== "RECHAZADA").map(toAgendaItemDto),
      rechazadas: citas.filter((c) => c.estado === "RECHAZADA").map(toAgendaItemDto),
    };
  },
};
