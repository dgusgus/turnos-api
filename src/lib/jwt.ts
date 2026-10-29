import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";

// Solo el personal inicia sesión. El público no tiene cuenta (ver módulo `public`).
export const ROLES = ["ADMIN", "OPERADOR"] as const;
export type RolName = (typeof ROLES)[number];

const payloadSchema = z.object({
  sub: z.string().min(1),
  rol: z.enum(ROLES),
});

export type AuthPayload = z.infer<typeof payloadSchema>;

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

// Lanza si el token es inválido, expiró o no tiene la forma esperada.
export function verifyToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  return payloadSchema.parse(decoded);
}
