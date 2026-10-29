import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import type { RolName } from "../../lib/jwt.js";

// Uso: router.post("/", authorize("ADMIN"), ...)  — va DESPUÉS de authenticate.
export const authorize =
  (...roles: RolName[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw AppError.unauthorized();
    if (!roles.includes(req.auth.rol)) throw AppError.forbidden();
    next();
  };
