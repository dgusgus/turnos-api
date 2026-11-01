import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { diasController } from "./dias.controller.js";

export const diasRouter = Router();

diasRouter.use(authenticate, authorize("ADMIN"));

diasRouter.get("/", diasController.list);
diasRouter.post("/", diasController.create);
diasRouter.delete("/:id", diasController.remove);
