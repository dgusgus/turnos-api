import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  // En desarrollo, logs legibles; en producción, JSON (para herramientas de logs).
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: ["req.headers.authorization", "req.headers.cookie"],
});
