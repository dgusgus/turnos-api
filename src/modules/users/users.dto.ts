import { z } from "zod";
import { paginationSchema } from "../../common/pagination.js";
import { ROLES } from "../../lib/jwt.js";

export const listUsersQuerySchema = paginationSchema;

// El ADMIN crea PERSONAL (ADMIN u OPERADOR). Los padres/tutores no tienen cuenta.
export const createUserSchema = z.object({
  email: z.email("Email inválido").transform((v) => v.toLowerCase()),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  nombre: z.string().trim().min(2).max(100),
  rol: z.enum(["ADMIN", "OPERADOR"]).default("OPERADOR"),
  sedeId: z.uuid().optional(),
});

export const updateUserSchema = z
  .object({
    nombre: z.string().trim().min(2).max(100),
    rol: z.enum(ROLES),
    activo: z.boolean(),
    sedeId: z.uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Envía al menos un campo para actualizar");

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
