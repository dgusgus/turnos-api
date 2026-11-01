import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { serviciosController } from "./servicios.controller.js";

export const serviciosRouter = Router();

// Configurar el catálogo es cosa del ADMIN. El operador solo atiende.
serviciosRouter.use(authenticate, authorize("ADMIN"));

serviciosRouter.get("/", serviciosController.list);
serviciosRouter.post("/", serviciosController.create);
serviciosRouter.get("/:id", serviciosController.getById);
serviciosRouter.patch("/:id", serviciosController.update);
serviciosRouter.delete("/:id", serviciosController.remove);
// PUT (no POST): reemplaza el recurso "horarios" completo.
serviciosRouter.put("/:id/horarios", serviciosController.reemplazarHorarios);
