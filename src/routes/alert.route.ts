import { Router } from "express";
import { AlertController } from "../controllers/alert.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

const router = Router();

router.get(
  "/notifications",
  authenticate,
  AlertController.getNotifications,
);

router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AlertController.getAllAlerts,
);

router.put(
  "/:id/approve",
  authenticate,
  authorize(Role.ADMIN),
  AlertController.approveAlert,
);

router.put(
  "/:id/reject",
  authenticate,
  authorize(Role.ADMIN),
  AlertController.rejectAlert,
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  AlertController.createAlert,
);

export default router;
