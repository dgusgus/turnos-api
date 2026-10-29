import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { citasController } from "./citas.controller.js";

export const citasRouter = Router();

// Bandeja de citas: solo personal. (El público usa /public/citas, sin sesión.)
citasRouter.use(authenticate, authorize("ADMIN", "OPERADOR"));

citasRouter.get("/", citasController.list);
citasRouter.post("/:id/aprobar", citasController.aprobar);
citasRouter.post("/:id/rechazar", citasController.rechazar);
