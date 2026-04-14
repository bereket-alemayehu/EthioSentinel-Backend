import { Router } from "express";
import { AdvisoryController } from "../controllers/advisory.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.post("/symptom-check", AdvisoryController.symptomCheck);

router.post("/generate", AdvisoryController.generateAdvisoryText);

router.get("/", AdvisoryController.getAllAdvisories);

router.get(
  "/drafts",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW),
  AdvisoryController.getDraftAdvisoryQueue,
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  AdvisoryController.createAdvisory,
);

router.patch(
  "/:id/approve",
  authenticate,
  authorize(UserRole.ADMIN),
  AdvisoryController.approveAdvisory,
);

router.patch(
  "/:id/status",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW),
  AdvisoryController.transitionDraftAdvisoryStatus,
);

export default router;
