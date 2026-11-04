import { Router } from "express";
import { limiter } from "../../common/middlewares/rate-limit.js";
import { publicController } from "./public.controller.js";
import { pantalla, pantallaEventos } from "./pantalla.js";

// API PÚBLICA: sin login. Cualquiera puede llamarla, así que lo único que la protege son
// la validación de cada campo, las reglas de negocio del service y estos límites por IP.
export const publicRouter = Router();

// Datos de personas y citas: que ningún navegador ni proxy los guarde en caché.
publicRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const limiteReservar = limiter({ windowMs: 60 * 60 * 1000, limit: 15 });
const limiteConsultar = limiter({ windowMs: 15 * 60 * 1000, limit: 30 }); // frena adivinar CIs
const limiteCancelar = limiter({ windowMs: 15 * 60 * 1000, limit: 20 });

// Lectura
publicRouter.get("/servicios", publicController.servicios);
publicRouter.get("/disponibilidad", publicController.disponibilidad);
publicRouter.get("/agenda", publicController.agenda);
// Pantalla de turnos (TV): foto del momento + canal SSE que avisa cuando cambia
publicRouter.get("/pantalla", pantalla);
publicRouter.get("/pantalla/eventos", pantallaEventos);

// Citas (sin sesión: se identifican con el enlace secreto o con código + CI)
publicRouter.post("/citas", limiteReservar, publicController.crearCita);
publicRouter.post("/citas/consulta", limiteConsultar, publicController.consultar); // antes de /:token
publicRouter.get("/citas/:token", publicController.citaPorToken);
publicRouter.post("/citas/:token/cancelar", limiteCancelar, publicController.cancelar);
