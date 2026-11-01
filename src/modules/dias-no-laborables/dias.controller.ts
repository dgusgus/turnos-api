import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { buildMeta } from "../../common/pagination.js";
import { idParamSchema } from "../../common/schemas.js";
import { createDiaSchema, listDiasQuerySchema } from "./dias.dto.js";
import { diasService } from "./dias.service.js";

const actorId = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.sub;
};

// `fecha` es una columna de solo fecha: sale como "2026-11-02", sin hora.
const toDiaDto = (d: { id: string; fecha: Date; motivo: string }) => ({
  id: d.id,
  fecha: d.fecha.toISOString().slice(0, 10),
  motivo: d.motivo,
});

export const diasController = {
  async list(req: Request, res: Response) {
    const query = listDiasQuerySchema.parse(req.query);
    const { items, total } = await diasService.list(query, actorId(req));
    res.json({ data: items.map(toDiaDto), meta: buildMeta(total, query) });
  },

  async create(req: Request, res: Response) {
    const input = createDiaSchema.parse(req.body);
    const { dia, advertencias } = await diasService.create(input, actorId(req));
    res.status(201).json({ data: toDiaDto(dia), advertencias });
  },

  async remove(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await diasService.remove(id, actorId(req));
    res.status(204).send();
  },
};
