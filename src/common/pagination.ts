import { z } from "zod";

// Parámetros estándar de listados: ?page=1&limit=20&search=texto
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const skipOf = ({ page, limit }: Pagination) => (page - 1) * limit;

export function buildMeta(total: number, { page, limit }: Pagination) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
