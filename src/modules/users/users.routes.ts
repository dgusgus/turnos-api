import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { usersController } from "./users.controller.js";

export const usersRouter = Router();

// Todo el módulo es solo para ADMIN.
usersRouter.use(authenticate, authorize("ADMIN"));

usersRouter.get("/", usersController.list);
usersRouter.post("/", usersController.create);
usersRouter.get("/:id", usersController.getById);
usersRouter.patch("/:id", usersController.update);
usersRouter.delete("/:id", usersController.remove);
