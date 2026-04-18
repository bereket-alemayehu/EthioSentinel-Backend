import { Router } from "express";
import { AIController } from "../controllers/ai.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.post(
  "/anomaly/reports/:reportId/trigger",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.RESEARCHER),
  AIController.triggerZScoreForReport,
);

router.post("/webhook/anomaly", AIController.ingestAnomalyWebhook);

export default router;
