import { AppError } from "../../common/errors.js";
import { skipOf } from "../../common/pagination.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from "./users.dto.js";

export const usersService = {
  async list(query: ListUsersQuery) {
    const where = query.search
      ? {
          OR: [
            { nombre: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [items, total] = await prisma.$transaction([
      prisma.usuario.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: skipOf(query),
        take: query.limit,
      }),
      prisma.usuario.count({ where }),
    ]);
    return { items, total };
  },

  async getById(id: string) {
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw AppError.notFound("Usuario no encontrado");
    return usuario;
  },

  async create({ password, ...data }: CreateUserInput) {
    return prisma.usuario.create({ data: { ...data, passwordHash: await hashPassword(password) } });
  },

  // `actorId` = admin que hace el cambio. Regla de negocio: no puede
  // quitarse a sí mismo el rol de ADMIN ni desactivarse (se quedaría sin acceso).
  async update(id: string, input: UpdateUserInput, actorId: string) {
    if (id === actorId && ((input.rol && input.rol !== "ADMIN") || input.activo === false)) {
      throw AppError.conflict("No puedes quitarte tu propio rol de admin ni desactivarte");
    }
    await this.getById(id);
    return prisma.usuario.update({ where: { id }, data: input });
  },

  async remove(id: string, actorId: string) {
    if (id === actorId) throw AppError.conflict("No puedes eliminar tu propio usuario");
    await this.getById(id);
    await prisma.usuario.delete({ where: { id } });
  },
};
