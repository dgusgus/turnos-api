import "dotenv/config";
import { z } from "zod";

// Si falta o es inválida una variable, la app NO arranca y te dice cuál.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Reglas de las citas (se pueden ajustar por colegio sin tocar el código)
  CITA_MAX_ACTIVAS: z.coerce.number().int().min(1).default(2), // por CI o teléfono
  CITA_MAX_DIAS_ANTICIPACION: z.coerce.number().int().min(1).default(30),
  CITA_MIN_ANTICIPACION_MIN: z.coerce.number().int().min(0).default(60),
  CITA_PENDIENTE_EXPIRA_HORAS: z.coerce.number().int().min(1).default(24),
  // "true" cuando la API está detrás de un proxy/hosting (Nginx, Render, etc.)
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
