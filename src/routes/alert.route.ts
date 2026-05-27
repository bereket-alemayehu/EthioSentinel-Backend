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
  authorize(Role.ADMIN, Role.RESEARCHER, Role.SUPER_ADMIN),
  AlertController.getAllAlerts,
);

router.get(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER, Role.SUPER_ADMIN),
  AlertController.getAlertById,
);

router.put(
  "/:id/approve",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AlertController.approveAlert,
);

router.put(
  "/:id/reject",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AlertController.rejectAlert,
);

router.post(
  "/",
  authenticate,
  authorize(Role.HEW, Role.ADMIN, Role.RESEARCHER, Role.SUPER_ADMIN),
  AlertController.createAlert,
);

export default router;
