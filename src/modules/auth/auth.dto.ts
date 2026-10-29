import { z } from "zod";

// DTO = forma exacta de los datos que entran. Todo lo demás se rechaza o ignora.
// No hay registro: el personal lo crea un ADMIN (/users) y el público no tiene cuenta.
export const loginSchema = z.object({
  email: z.email("Email inválido").transform((v) => v.toLowerCase()),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export type LoginInput = z.infer<typeof loginSchema>;
