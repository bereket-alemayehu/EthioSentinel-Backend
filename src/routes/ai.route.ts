import { Router } from "express";
import { AIController } from "../controllers/ai.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { authenticateInternal } from "../middlewares/authenticateInternal";
import { Role } from "@prisma/client";

const router = Router();

router.post(
  "/anomaly/reports/:reportId/trigger",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER, Role.SUPER_ADMIN),
  AIController.triggerZScoreForReport,
);

router.post("/webhook/anomaly", AIController.ingestAnomalyWebhook);

/**
 * POST /ai/nlp/advisory-draft
 * Internal endpoint — called by the Python AI worker, not human users.
 * Protected by static API key (x-internal-token header), not JWT.
 */
router.post(
  "/nlp/advisory-draft",
  authenticateInternal,
  AIController.ingestNlpAdvisoryDraft,
);

export default router;
