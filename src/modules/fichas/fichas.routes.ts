import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { fichasController } from "./fichas.controller.js";

export const fichasRouter = Router();

// Entregar fichas es trabajo del personal (ADMIN y OPERADOR). El público no inicia sesión.
fichasRouter.use(authenticate, authorize("ADMIN", "OPERADOR"));

fichasRouter.get("/servicios", fichasController.servicios);
fichasRouter.get("/cupos", fichasController.cupos);
fichasRouter.get("/", fichasController.list);
fichasRouter.post("/", fichasController.crear);
fichasRouter.post("/:id/cancelar", fichasController.cancelar);
