import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Ruta no encontrada: ${req.method} ${req.path}`));
};

// Códigos de error de Prisma que conviene traducir a respuestas HTTP claras.
const prismaCode = (err: unknown): string | undefined =>
  typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
    ? err.code
    : undefined;

// Middleware global: TODA respuesta de error sale con el mismo formato.
// Express 5 envía aquí también los errores de handlers async.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? "");

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        requestId,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  const code = prismaCode(err);
  if (code === "P2002") {
    res.status(409).json({
      error: { code: "CONFLICT", message: "Ya existe un registro con esos datos", requestId },
    });
    return;
  }
  if (code === "P2025") {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId },
    });
    return;
  }

  req.log.error({ err }, "Error no controlado");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Error interno del servidor", requestId },
  });
};
