import { z } from "zod";
import { paginationSchema } from "../../common/pagination.js";

// ---- Campos reutilizables (los usa también el módulo público) ----

const texto = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(min, `Mínimo ${min} caracteres`).max(max, `Máximo ${max} caracteres`));

// CI de Bolivia: número + complemento opcional ("1234567", "1234567-1A"). Se normaliza
// (sin espacios ni guiones, en mayúsculas) para que "1234567 1a" y "1234567-1A" sean
// la misma persona: ambos quedan "12345671A".
export const documentoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[0-9A-Z]{4,20}$/, "Documento inválido"));

// Teléfono: acepta "+591 7123 4567" o "71234567"; guarda solo + y dígitos.
export const telefonoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, "Teléfono inválido"));

export const nombresSchema = texto(2, 80);
export const apellidosSchema = texto(2, 80);
export const estudianteNombreSchema = texto(3, 100);
export const estudianteCursoSchema = texto(1, 30);
export const motivoSchema = texto(3, 300);

export const fechaSchema = z.iso.date("Fecha inválida (usa AAAA-MM-DD)");

// ---- Bandeja del personal ----

export const listCitasQuerySchema = paginationSchema.extend({
  fecha: fechaSchema.optional(),
  estado: z
    .enum([
      "PENDIENTE",
      "CONFIRMADA",
      "EN_COLA",
      "ATENDIDA",
      "RECHAZADA",
      "CANCELADA",
      "NO_ASISTIO",
    ])
    .optional(),
});

export const rechazarCitaSchema = z.object({
  motivo: texto(3, 300),
});

export type ListCitasQuery = z.infer<typeof listCitasQuerySchema>;
export type RechazarCitaInput = z.infer<typeof rechazarCitaSchema>;
