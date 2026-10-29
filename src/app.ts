import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { errorHandler, notFoundHandler } from "./common/middlewares/error-handler.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { apiRouter } from "./routes.js";

// createApp() separado de server.ts: los tests importan la app sin abrir un puerto.
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  // Cada petición lleva un ID (header X-Request-Id) que aparece en todos sus logs.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const entrante = req.headers["x-request-id"];
        const id = typeof entrante === "string" && entrante.length <= 100 ? entrante : randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url?.startsWith("/health") ?? false },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (req) => env.NODE_ENV === "test" || req.path.startsWith("/health"),
    }),
  );

  // Health checks: para Docker, hosting y monitoreo.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.round(process.uptime()) });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "database_unavailable" });
    }
  });

  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
