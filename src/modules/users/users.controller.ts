import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { buildMeta } from "../../common/pagination.js";
import { idParamSchema } from "../../common/schemas.js";
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from "./users.dto.js";
import { toUsuarioDto } from "./users.mapper.js";
import { usersService } from "./users.service.js";

const actorId = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.sub;
};

export const usersController = {
  async list(req: Request, res: Response) {
    const query = listUsersQuerySchema.parse(req.query);
    const { items, total } = await usersService.list(query);
    res.json({ data: items.map(toUsuarioDto), meta: buildMeta(total, query) });
  },

  async getById(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: toUsuarioDto(await usersService.getById(id)) });
  },

  async create(req: Request, res: Response) {
    const input = createUserSchema.parse(req.body);
    res.status(201).json({ data: toUsuarioDto(await usersService.create(input)) });
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    res.json({ data: toUsuarioDto(await usersService.update(id, input, actorId(req))) });
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await usersService.remove(id, actorId(req));
    res.status(204).send();
  },
};
