import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import { verifyToken } from "../../lib/jwt.js";

// Exige "Authorization: Bearer <token>" y deja el payload en req.auth.
// Nota (Nivel 1): el token es stateless; un usuario desactivado conserva
// acceso hasta que su token expire. En Nivel 2: refresh token + revocación.
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw AppError.unauthorized("Falta el token de acceso");
  }
  try {
    req.auth = verifyToken(header.slice("Bearer ".length));
  } catch {
    throw AppError.unauthorized("Token inválido o expirado");
  }
  next();
}
