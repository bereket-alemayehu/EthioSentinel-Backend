import { Router } from "express";
import { AlertController } from "../controllers/alert.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.get("/", AlertController.getAllAlerts);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  AlertController.createAlert
);

export default router;
