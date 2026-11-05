import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { ventanillasController } from "./ventanillas.controller.js";

export const ventanillasRouter = Router();
ventanillasRouter.use(authenticate);

// Listar: el operador elige en qué ventanilla trabaja. Configurar: solo el ADMIN.
ventanillasRouter.get("/", authorize("ADMIN", "OPERADOR"), ventanillasController.list);
ventanillasRouter.post("/", authorize("ADMIN"), ventanillasController.create);
ventanillasRouter.patch("/:id", authorize("ADMIN"), ventanillasController.update);
ventanillasRouter.delete("/:id", authorize("ADMIN"), ventanillasController.remove);
