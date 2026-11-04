import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { citasRouter } from "./modules/citas/citas.routes.js";
import { diasRouter } from "./modules/dias-no-laborables/dias.routes.js";
import { publicRouter } from "./modules/public/public.routes.js";
import { serviciosRouter } from "./modules/servicios/servicios.routes.js";
import { turnosRouter } from "./modules/turnos/turnos.routes.js";
import { ventanillasRouter } from "./modules/ventanillas/ventanillas.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

// Aquí se registra cada módulo nuevo. Versionado en la URL: /api/v1/...
//   /public → SIN login: lo usa el público (reservar, agenda, consultar mi cita)
//   el resto → con login de personal (ADMIN / OPERADOR)
//   /servicios y /dias-no-laborables → solo ADMIN: configurar qué se atiende y cuándo (Paso 2)
//   /turnos y /ventanillas → ADMIN y OPERADOR: la cola del día (Paso 4)
// Próximo: pantalla pública de turnos en tiempo real (Paso 5).
export const apiRouter = Router();

apiRouter.use("/public", publicRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/citas", citasRouter);
apiRouter.use("/servicios", serviciosRouter);
apiRouter.use("/dias-no-laborables", diasRouter);
apiRouter.use("/turnos", turnosRouter);
apiRouter.use("/ventanillas", ventanillasRouter);
