import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { turnosController } from "./turnos.controller.js";

export const turnosRouter = Router();

// La cola la manejan los dos roles del personal.
turnosRouter.use(authenticate, authorize("ADMIN", "OPERADOR"));

turnosRouter.get("/", turnosController.list);
turnosRouter.post("/", turnosController.crear); // turno de mostrador
turnosRouter.post("/checkin", turnosController.checkin); // convierte una cita en turno
turnosRouter.post("/llamar-siguiente", turnosController.llamarSiguiente);
turnosRouter.post("/:id/rellamar", turnosController.rellamar);
turnosRouter.post("/:id/iniciar", turnosController.iniciar);
turnosRouter.post("/:id/finalizar", turnosController.finalizar);
turnosRouter.post("/:id/no-se-presento", turnosController.noSePresento);
turnosRouter.post("/:id/cancelar", turnosController.cancelar);
