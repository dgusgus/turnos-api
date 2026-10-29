import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: la conexión y el seed se configuran aquí, no en schema.prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Con "" `prisma generate` funciona sin .env; migrate fallará si falta la URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
