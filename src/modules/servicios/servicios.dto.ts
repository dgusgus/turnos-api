import { z } from "zod";
import { paginationSchema } from "../../common/pagination.js";
import { horaAMin } from "../../lib/time.js";

// DTO = "Data Transfer Object": el contrato de lo que la API ACEPTA. Todo lo que llega de
// afuera se valida aquí con Zod antes de tocar la lógica; si no cumple, responde 400.

// Texto opcional: "" o solo espacios se guarda como null (así la BD no acumula cadenas vacías).
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

// Los campos de un servicio, SIN valores por defecto. Se separan a propósito:
//  - crear les agrega defaults (si no mandas `duracionMin`, vale 15),
//  - editar los usa tal cual con .partial(). Si el PATCH heredara los defaults, un
//    PATCH { nombre: "X" } reiniciaría sin avisar `duracionMin` y `activo`.
const camposServicio = {
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  descripcion: textoOpcional(300),
  // "a" → "A". Es la letra del turno (A-001). 1 o 2 letras para que quepa en una pantalla.
  prefijo: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{1,2}$/, "Usa 1 o 2 letras (A-Z), sin números ni espacios")),
  // De 5 en 5: las franjas de la agenda quedan en una cuadrícula ordenada (08:00, 08:15...).
  duracionMin: z.number().int().min(5).max(240).multipleOf(5, "Debe ser múltiplo de 5"),
  permiteCita: z.boolean(),
  requiereAprobacion: z.boolean(),
  activo: z.boolean(),
};

export const createServicioSchema = z.object({
  ...camposServicio,
  duracionMin: camposServicio.duracionMin.default(15),
  permiteCita: camposServicio.permiteCita.default(true),
  requiereAprobacion: camposServicio.requiereAprobacion.default(false),
  activo: camposServicio.activo.default(true),
});

export const updateServicioSchema = z
  .object(camposServicio)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Envía al menos un campo para actualizar");

export const listServiciosQuerySchema = paginationSchema.extend({
  // Los query params siempre llegan como texto: "true" / "false".
  activo: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

// ---- Horarios ----

// "08:00" - "23:59". La BD lo guarda en minutos; la API habla en horas legibles.
const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:MM (ej. 08:30)");

const ventanaSchema = z
  .object({
    diaSemana: z.number().int().min(1, "1 = lunes").max(7, "7 = domingo"),
    desde: horaSchema,
    hasta: horaSchema,
  })
  .transform(({ diaSemana, desde, hasta }) => ({
    diaSemana,
    inicioMin: horaAMin(desde),
    finMin: horaAMin(hasta),
  }));

// PUT reemplaza TODO el horario semanal de golpe. Es más simple y seguro que crear/editar/borrar
// ventanas sueltas: el ADMIN ve y edita la semana completa, y nunca queda a medias.
// Un arreglo vacío = el servicio sin horarios (nadie puede reservar).
export const reemplazarHorariosSchema = z.object({
  horarios: z.array(ventanaSchema).max(28, "Máximo 4 ventanas por día"),
});

export type CreateServicioInput = z.infer<typeof createServicioSchema>;
export type UpdateServicioInput = z.infer<typeof updateServicioSchema>;
export type ListServiciosQuery = z.infer<typeof listServiciosQuerySchema>;
export type ReemplazarHorariosInput = z.infer<typeof reemplazarHorariosSchema>;
