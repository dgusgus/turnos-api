import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("El id debe ser un UUID válido") });
