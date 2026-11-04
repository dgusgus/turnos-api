import { z } from "zod";
import { codigoSchema } from "../public/public.dto.js";

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

// Turno de MOSTRADOR: lo genera el operador para quien llega sin cita.
// (CITA no se puede elegir aquí: esa prioridad solo la da el check-in de una cita.)
export const crearTurnoSchema = z.object({
  servicioId: z.uuid(),
  prioridad: z.enum(["NORMAL", "PREFERENCIAL"]).default("NORMAL"),
  nombreVisitante: textoOpcional(100),
  estudianteReferencia: textoOpcional(100),
  observacion: textoOpcional(200),
});

// Check-in: la persona llega con su cita y dicta (o muestra) el código "R-K7M2Q".
export const checkinSchema = z.object({ codigo: codigoSchema });

// El operador dice en qué ventanilla está; opcionalmente, de qué servicio quiere atender.
export const llamarSchema = z.object({
  ventanillaId: z.uuid(),
  servicioId: z.uuid().optional(),
});

export const listTurnosQuerySchema = z.object({
  // "activos" = los que siguen en la cola (esperando, llamados, atendiéndose). "todos" = también los cerrados de hoy.
  vista: z.enum(["activos", "todos"]).default("activos"),
  servicioId: z.uuid().optional(),
});

export type CrearTurnoInput = z.infer<typeof crearTurnoSchema>;
export type LlamarInput = z.infer<typeof llamarSchema>;
export type ListTurnosQuery = z.infer<typeof listTurnosQuerySchema>;
