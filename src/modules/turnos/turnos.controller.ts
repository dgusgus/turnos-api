import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { idParamSchema } from "../../common/schemas.js";
import {
  checkinSchema,
  crearTurnoSchema,
  listTurnosQuerySchema,
  llamarSchema,
} from "./turnos.dto.js";
import type { Accion } from "./turnos.estados.js";
import { toTurnoDto } from "./turnos.mapper.js";
import { turnosService } from "./turnos.service.js";

const actorId = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth.sub;
};

// Las 4 acciones sobre un turno comparten controlador: solo cambia el nombre de la acción.
const accion = (nombre: Accion) => async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json({ data: toTurnoDto(await turnosService.cambiarEstado(id, nombre, actorId(req))) });
};

export const turnosController = {
  async list(req: Request, res: Response) {
    const query = listTurnosQuerySchema.parse(req.query);
    const items = await turnosService.list(query, actorId(req));
    res.json({ data: items.map(toTurnoDto) });
  },

  async crear(req: Request, res: Response) {
    const input = crearTurnoSchema.parse(req.body);
    res.status(201).json({ data: toTurnoDto(await turnosService.crear(input, actorId(req))) });
  },

  async checkin(req: Request, res: Response) {
    const { codigo } = checkinSchema.parse(req.body);
    res.status(201).json({ data: toTurnoDto(await turnosService.checkin(codigo, actorId(req))) });
  },

  async llamarSiguiente(req: Request, res: Response) {
    const input = llamarSchema.parse(req.body);
    res.json({ data: toTurnoDto(await turnosService.llamarSiguiente(input, actorId(req))) });
  },

  async rellamar(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json({ data: toTurnoDto(await turnosService.rellamar(id, actorId(req))) });
  },

  iniciar: accion("iniciar"),
  finalizar: accion("finalizar"),
  noSePresento: accion("noSePresento"),
  cancelar: accion("cancelar"),
};
