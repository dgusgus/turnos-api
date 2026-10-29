import type { Request, Response } from "express";
import {
  agendaQuerySchema,
  consultaSchema,
  crearCitaSchema,
  disponibilidadQuerySchema,
  tokenParamSchema,
} from "./public.dto.js";
import { toServicioPublicoDto } from "./public.mapper.js";
import { publicService } from "./public.service.js";

export const publicController = {
  async servicios(_req: Request, res: Response) {
    res.json({ data: (await publicService.servicios()).map(toServicioPublicoDto) });
  },

  async disponibilidad(req: Request, res: Response) {
    const { servicioId, fecha } = disponibilidadQuerySchema.parse(req.query);
    res.json({ data: await publicService.disponibilidad(servicioId, fecha) });
  },

  async agenda(req: Request, res: Response) {
    const query = agendaQuerySchema.parse(req.query);
    res.json({ data: await publicService.agenda(query) });
  },

  async crearCita(req: Request, res: Response) {
    const input = crearCitaSchema.parse(req.body);
    res.status(201).json({ data: await publicService.crear(input) });
  },

  async consultar(req: Request, res: Response) {
    const input = consultaSchema.parse(req.body);
    res.json({ data: await publicService.consultar(input) });
  },

  async citaPorToken(req: Request, res: Response) {
    const { token } = tokenParamSchema.parse(req.params);
    res.json({ data: await publicService.porToken(token) });
  },

  async cancelar(req: Request, res: Response) {
    const { token } = tokenParamSchema.parse(req.params);
    res.json({ data: await publicService.cancelar(token) });
  },
};
