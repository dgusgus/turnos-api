import { AppError } from "../../common/errors.js";
import { signToken } from "../../lib/jwt.js";
import { verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { toUsuarioDto } from "../users/users.mapper.js";
import type { LoginInput } from "./auth.dto.js";

// Service = lógica de negocio. No sabe nada de HTTP (req/res).
export const authService = {
  async login({ email, password }: LoginInput) {
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    // Mismo mensaje para "no existe" y "contraseña mala": no revela qué emails existen.
    const valido = usuario ? await verifyPassword(password, usuario.passwordHash) : false;
    if (!usuario || !valido) throw AppError.unauthorized("Credenciales inválidas");
    if (!usuario.activo) throw AppError.forbidden("Usuario desactivado");

    return {
      token: signToken({ sub: usuario.id, rol: usuario.rol }),
      usuario: toUsuarioDto(usuario),
    };
  },

  async me(userId: string) {
    const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario || !usuario.activo) throw AppError.unauthorized("Sesión inválida");
    return toUsuarioDto(usuario);
  },
};
