import { z } from "zod";
import {
  apellidosSchema,
  documentoSchema,
  estudianteCursoSchema,
  estudianteNombreSchema,
  fechaSchema,
  motivoSchema,
  nombresSchema,
  telefonoSchema,
} from "../citas/citas.dto.js";

export const disponibilidadQuerySchema = z.object({
  servicioId: z.uuid("servicioId debe ser un UUID válido"),
  fecha: fechaSchema,
});

export const agendaQuerySchema = z.object({
  fecha: fechaSchema.optional(), // por defecto, hoy
  sedeId: z.uuid().optional(), // por defecto, la primera sede activa
  servicioId: z.uuid().optional(),
});

// Datos que escribe quien reserva (sin cuenta). Todo se valida y normaliza aquí.
export const crearCitaSchema = z.object({
  servicioId: z.uuid("servicioId debe ser un UUID válido"),
  // El mismo valor que devolvió /public/disponibilidad en `franjas[].inicio`
  inicio: z.iso.datetime("Hora de inicio inválida"),
  nombres: nombresSchema,
  apellidos: apellidosSchema,
  documento: documentoSchema,
  telefono: telefonoSchema,
  estudianteNombre: estudianteNombreSchema,
  estudianteCurso: estudianteCursoSchema,
  motivo: motivoSchema,
});

// El código se acepta "como lo escriba la gente": "r-k7m2q", "R K7M2Q", "RK7M2Q"...
export const codigoSchema = z
  .string()
  .trim()
  .transform((v) => {
    const s = v.replace(/[\s-]/g, "").toUpperCase();
    return s.length === 6 && s.startsWith("R") ? `R-${s.slice(1)}` : s;
  })
  .pipe(z.string().regex(/^R-[A-Z0-9]{5}$/, "Código inválido"));

export const consultaSchema = z.object({
  codigo: codigoSchema,
  documento: documentoSchema,
});

export const tokenParamSchema = z.object({
  token: z.string().min(20, "Enlace inválido").max(128, "Enlace inválido"),
});

export type CrearCitaInput = z.infer<typeof crearCitaSchema>;
export type ConsultaInput = z.infer<typeof consultaSchema>;
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;
