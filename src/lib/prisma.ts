import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

// Prisma 7 usa un "driver adapter": la conexión la maneja el driver `pg`.
// El cliente no se conecta hasta la primera consulta.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
