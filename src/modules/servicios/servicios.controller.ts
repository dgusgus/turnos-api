import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { buildMeta } from "../../common/pagination.js";
import { idParamSchema } from "../../common/schemas.js";
import {
  createServicioSchema,
  listServiciosQuerySchema,
  reemplazarHorariosSchema,
  updateServicioSchema,
} from "./servicios.dto.js";
import { toServicioDto } from "./servicios.mapper.js";
import { serviciosService } from "./servicios.service.js";

// Controller: traduce HTTP ↔ lógica. Valida la entrada (DTO), llama al service y arma la
// respuesta. NO contiene reglas de negocio: esas viven en el service.
const actorId = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.sub;
};

export const serviciosController = {
  async list(req: Request, res: Response) {
    const query = listServiciosQuerySchema.parse(req.query);
    const { items, total } = await serviciosService.list(query, actorId(req));
    res.json({ data: items.map(toServicioDto), meta: buildMeta(total, query) });
  },

  async getById(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: toServicioDto(await serviciosService.getById(id, actorId(req))) });
  },

  async create(req: Request, res: Response) {
    const input = createServicioSchema.parse(req.body);
    res
      .status(201)
      .json({ data: toServicioDto(await serviciosService.create(input, actorId(req))) });
  },

  async update(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = updateServicioSchema.parse(req.body);
    const { servicio, advertencias } = await serviciosService.update(id, input, actorId(req));
    res.json({ data: toServicioDto(servicio), advertencias });
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await serviciosService.remove(id, actorId(req));
    res.status(204).send();
  },

  async reemplazarHorarios(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = reemplazarHorariosSchema.parse(req.body);
    const { servicio, advertencias } = await serviciosService.reemplazarHorarios(
      id,
      input,
      actorId(req),
    );
    res.json({ data: toServicioDto(servicio), advertencias });
  },
};
