import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

// Límite de peticiones por IP para una ruta concreta (login, reservar, consultar...).
// Va ADEMÁS del límite global de app.ts. En tests se desactiva.
//
// Ojo: muchos celulares comparten una misma IP pública (la red del operador móvil),
// por eso los límites de las rutas públicas son generosos para uso normal y solo
// frenan el abuso automatizado.
export const limiter = ({ windowMs, limit }: { windowMs: number; limit: number }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    message: {
      error: { code: "RATE_LIMITED", message: "Demasiados intentos, intenta de nuevo más tarde" },
    },
  });
