import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { citasRouter } from "./modules/citas/citas.routes.js";
import { publicRouter } from "./modules/public/public.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

// Aquí se registra cada módulo nuevo. Versionado en la URL: /api/v1/...
//   /public → SIN login: lo usa el público (reservar, agenda, consultar mi cita)
//   el resto → con login de personal (ADMIN / OPERADOR)
// Próximos módulos: sedes, servicios (admin), horarios, ventanillas, turnos.
export const apiRouter = Router();

apiRouter.use("/public", publicRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/citas", citasRouter);
