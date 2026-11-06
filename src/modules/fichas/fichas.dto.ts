import { z } from "zod";
import { documentoSchema, telefonoSchema } from "../citas/citas.dto.js";

// "" (campo vacío del formulario) se trata como "no se escribió nada".
const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

// Entregar una ficha. Si no se manda `fecha`, la API usa la próxima con cupo (la "sugerida").
export const crearFichaSchema = z.object({
  servicioId: z.uuid(),
  fecha: z.iso.date("Fecha inválida (usa AAAA-MM-DD)").optional(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  documento: opcional(documentoSchema),
  telefono: opcional(telefonoSchema),
  referencia: textoOpcional(100),
});

export const listFichasQuerySchema = z.object({
  fecha: z.iso.date("Fecha inválida (usa AAAA-MM-DD)").optional(), // por defecto, hoy
  servicioId: z.uuid().optional(),
});

export const cuposQuerySchema = z.object({ servicioId: z.uuid() });

export type CrearFichaInput = z.infer<typeof crearFichaSchema>;
export type ListFichasQuery = z.infer<typeof listFichasQuerySchema>;
