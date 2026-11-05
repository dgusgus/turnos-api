import { z } from "zod";

// Contrato de lo que la API ACEPTA para ventanillas (todo se valida aquí antes de la lógica).
// Igual que en servicios: los campos base van SIN defaults; el default (`activa: true`) solo
// se agrega al crear. Si el PATCH los heredara, editar el nombre reactivaría la ventanilla.
const camposVentanilla = {
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(60),
  activa: z.boolean(),
  // Qué servicios atiende. Debe haber al menos uno: una ventanilla sin servicios nunca
  // podría llamar a nadie. `new Set` quita repetidos sin molestar al cliente.
  servicioIds: z
    .array(z.uuid())
    .min(1, "Elige al menos un servicio")
    .max(50)
    .transform((ids) => [...new Set(ids)]),
};

export const createVentanillaSchema = z.object({
  ...camposVentanilla,
  activa: camposVentanilla.activa.default(true),
});

export const updateVentanillaSchema = z
  .object(camposVentanilla)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Envía al menos un campo para actualizar");

export const listVentanillasQuerySchema = z.object({
  // Solo el ADMIN puede pedir también las inactivas (para reactivarlas).
  incluirInactivas: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type CreateVentanillaInput = z.infer<typeof createVentanillaSchema>;
export type UpdateVentanillaInput = z.infer<typeof updateVentanillaSchema>;
