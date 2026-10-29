import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Variables mínimas para que los tests corran sin .env ni base de datos
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_SECRET: "secreto-solo-para-tests-de-al-menos-32-caracteres",
      JWT_EXPIRES_IN: "1h",
      CORS_ORIGIN: "http://localhost:5173",
    },
  },
});
