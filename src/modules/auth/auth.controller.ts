import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { loginSchema } from "./auth.dto.js";
import { authService } from "./auth.service.js";

// Controller = capa HTTP: valida la entrada, llama al service, arma la respuesta.
export const authController = {
  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    res.json({ data: await authService.login(input) });
  },

  async me(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    res.json({ data: await authService.me(req.auth.sub) });
  },
};
