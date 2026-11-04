import { Router } from "express";
import type { Request, Response } from "express";
import { AppError } from "../../common/errors.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { sedeDelPersonal } from "../../common/sede.js";
import { prisma } from "../../lib/prisma.js";

// Solo lectura por ahora: el operador elige en qué ventanilla está trabajando.
// (El CRUD de ventanillas para el ADMIN es el siguiente paso de configuración.)
export const ventanillasRouter = Router();
ventanillasRouter.use(authenticate, authorize("ADMIN", "OPERADOR"));

ventanillasRouter.get("/", async (req: Request, res: Response) => {
  if (!req.auth) throw AppError.unauthorized();
  const { sedeId } = await sedeDelPersonal(req.auth.sub);
  const items = await prisma.ventanilla.findMany({
    where: { sedeId, activa: true },
    orderBy: { nombre: "asc" },
    include: {
      servicios: { select: { servicio: { select: { id: true, nombre: true, prefijo: true } } } },
    },
  });
  res.json({
    data: items.map(
      (v: {
        id: string;
        nombre: string;
        servicios: { servicio: { id: string; nombre: string; prefijo: string } }[];
      }) => ({
        id: v.id,
        nombre: v.nombre,
        servicios: v.servicios.map((s) => s.servicio),
      }),
    ),
  });
});
