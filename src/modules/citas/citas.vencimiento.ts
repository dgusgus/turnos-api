import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

// Una cita PENDIENTE ocupa la hora. Si el personal no responde en CITA_PENDIENTE_EXPIRA_HORAS
// (o la hora ya pasó), se rechaza sola y la hora vuelve a estar libre.
//
// Se ejecuta al inicio de cada consulta de citas (disponibilidad, agenda, reservar,
// bandeja del operador). Es un UPDATE barato (índice en estado + creadoEn) y evita
// necesitar un proceso aparte. Nivel 2: un cron/worker.
export async function liberarPendientesVencidas(ahora = new Date()) {
  const limite = new Date(ahora.getTime() - env.CITA_PENDIENTE_EXPIRA_HORAS * 60 * 60 * 1000);
  const { count } = await prisma.cita.updateMany({
    where: {
      estado: "PENDIENTE",
      OR: [{ creadoEn: { lt: limite } }, { inicio: { lt: ahora } }],
    },
    data: {
      estado: "RECHAZADA",
      motivoRechazo: "Venció sin respuesta del colegio. Puedes reservar otro horario.",
      decididaEn: ahora,
    },
  });
  return count;
}
