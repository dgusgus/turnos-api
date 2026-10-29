import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { limiter } from "../../common/middlewares/rate-limit.js";
import { authController } from "./auth.controller.js";

// Límite estricto contra fuerza bruta en el login.
const loginLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 20 });

export const authRouter = Router();

authRouter.post("/login", loginLimiter, authController.login);
authRouter.get("/me", authenticate, authController.me);
