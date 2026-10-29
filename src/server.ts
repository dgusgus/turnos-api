import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API lista en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Cierre ordenado: deja de aceptar peticiones, termina las activas y cierra la BD.
function shutdown(signal: string) {
  logger.info(`${signal} recibido, cerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
