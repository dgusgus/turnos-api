import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { citasRouter } from "./modules/citas/citas.routes.js";
import { diasRouter } from "./modules/dias-no-laborables/dias.routes.js";
import { publicRouter } from "./modules/public/public.routes.js";
import { serviciosRouter } from "./modules/servicios/servicios.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

// Aquí se registra cada módulo nuevo. Versionado en la URL: /api/v1/...
//   /public → SIN login: lo usa el público (reservar, agenda, consultar mi cita)
//   el resto → con login de personal (ADMIN / OPERADOR)
//   /servicios y /dias-no-laborables → solo ADMIN: configurar qué se atiende y cuándo (Paso 2)
// Próximos módulos: ventanillas, turnos.
export const apiRouter = Router();

apiRouter.use("/public", publicRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/citas", citasRouter);
apiRouter.use("/servicios", serviciosRouter);
apiRouter.use("/dias-no-laborables", diasRouter);
