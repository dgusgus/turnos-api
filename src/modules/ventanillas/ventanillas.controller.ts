import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { idParamSchema } from "../../common/schemas.js";
import {
  createVentanillaSchema,
  listVentanillasQuerySchema,
  updateVentanillaSchema,
} from "./ventanillas.dto.js";
import { toVentanillaDto } from "./ventanillas.mapper.js";
import { ventanillasService } from "./ventanillas.service.js";

const actor = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export const ventanillasController = {
  async list(req: Request, res: Response) {
    const auth = actor(req);
    const { incluirInactivas } = listVentanillasQuerySchema.parse(req.query);
    // El operador solo ve las activas, aunque pida más: ver las inactivas es de configuración.
    const todas = auth.rol === "ADMIN" && incluirInactivas === true;
    const items = await ventanillasService.list(auth.sub, todas);
    res.json({ data: items.map(toVentanillaDto) });
  },

  async create(req: Request, res: Response) {
    const input = createVentanillaSchema.parse(req.body);
    const v = await ventanillasService.create(input, actor(req).sub);
    res.status(201).json({ data: toVentanillaDto(v) });
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateVentanillaSchema.parse(req.body);
    res.json({ data: toVentanillaDto(await ventanillasService.update(id, input, actor(req).sub)) });
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await ventanillasService.remove(id, actor(req).sub);
    res.status(204).send();
  },
};
