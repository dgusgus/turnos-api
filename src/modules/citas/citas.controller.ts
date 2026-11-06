import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { buildMeta } from "../../common/pagination.js";
import { idParamSchema } from "../../common/schemas.js";
import { crearCitaSchema } from "../public/public.dto.js";
import { listCitasQuerySchema, rechazarCitaSchema } from "./citas.dto.js";
import { toCitaStaffDto } from "./citas.mapper.js";
import { citasService } from "./citas.service.js";

const actorId = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.sub;
};

export const citasController = {
  async list(req: Request, res: Response) {
    const query = listCitasQuerySchema.parse(req.query);
    const { items, total } = await citasService.list(query, actorId(req));
    res.json({ data: items.map(toCitaStaffDto), meta: buildMeta(total, query) });
  },

  // Cita creada por el personal. Devuelve también el `token` (enlace secreto) para entregárselo a la persona.
  async crear(req: Request, res: Response) {
    const input = crearCitaSchema.parse(req.body);
    res.status(201).json({ data: await citasService.crearPorPersonal(input, actorId(req)) });
  },

  async aprobar(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: toCitaStaffDto(await citasService.aprobar(id, actorId(req))) });
  },

  async rechazar(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { motivo } = rechazarCitaSchema.parse(req.body);
    res.json({ data: toCitaStaffDto(await citasService.rechazar(id, motivo, actorId(req))) });
  },
};
