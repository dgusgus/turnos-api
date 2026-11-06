import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { idParamSchema } from "../../common/schemas.js";
import { crearFichaSchema, cuposQuerySchema, listFichasQuerySchema } from "./fichas.dto.js";
import { toFichaDto } from "./fichas.mapper.js";
import { fichasService } from "./fichas.service.js";

const actorId = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.sub;
};

export const fichasController = {
  async servicios(req: Request, res: Response) {
    res.json({ data: await fichasService.servicios(actorId(req)) });
  },

  async cupos(req: Request, res: Response) {
    const { servicioId } = cuposQuerySchema.parse(req.query);
    res.json({ data: await fichasService.cupos(servicioId, actorId(req)) });
  },

  async list(req: Request, res: Response) {
    const query = listFichasQuerySchema.parse(req.query);
    const { fecha, fichas, resumen } = await fichasService.list(query, actorId(req));
    res.json({ data: fichas.map(toFichaDto), meta: { fecha, resumen } });
  },

  async crear(req: Request, res: Response) {
    const input = crearFichaSchema.parse(req.body);
    res.status(201).json({ data: toFichaDto(await fichasService.crear(input, actorId(req))) });
  },

  async cancelar(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: toFichaDto(await fichasService.cancelar(id, actorId(req))) });
  },
};
