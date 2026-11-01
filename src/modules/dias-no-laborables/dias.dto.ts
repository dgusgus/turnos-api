import { z } from "zod";
import { paginationSchema } from "../../common/pagination.js";
import { fechaSchema } from "../citas/citas.dto.js";

// Feriados, vacaciones, suspensión de clases: ese día la sede NO atiende, aunque el
// servicio tenga horario. La parte pública (disponibilidad) ya consulta esta tabla.
export const createDiaSchema = z.object({
  fecha: fechaSchema,
  motivo: z.string().trim().min(3, "Mínimo 3 caracteres").max(120),
});

export const listDiasQuerySchema = paginationSchema.extend({
  // Por defecto: de hoy en adelante (lo pasado no interesa para configurar).
  desde: fechaSchema.optional(),
});

export type CreateDiaInput = z.infer<typeof createDiaSchema>;
export type ListDiasQuery = z.infer<typeof listDiasQuerySchema>;
