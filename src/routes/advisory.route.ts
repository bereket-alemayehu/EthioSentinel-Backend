import { Router } from "express";
import { AdvisoryController } from "../controllers/advisory.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "../../generated/prisma/enums";

const router = Router();

router.get("/chat/history", authenticate, AdvisoryController.getChatHistory);
router.post("/chat/message", authenticate, AdvisoryController.sendChatMessage);
router.delete("/chat/history", authenticate, AdvisoryController.clearChatHistory);

router.post("/symptom-check", AdvisoryController.symptomCheck);

router.post(
  "/generate",
  authenticate,
  authorize(Role.ADMIN, Role.HEW),
  AdvisoryController.generateAdvisoryText,
);

router.get("/", AdvisoryController.getAllAdvisories);

router.get(
  "/drafts",
  authenticate,
  authorize(Role.ADMIN),
  AdvisoryController.getDraftAdvisories,
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  AdvisoryController.createAdvisory,
);

router.patch(
  "/:id/approve",
  authenticate,
  authorize(Role.ADMIN),
  AdvisoryController.approveAdvisory,
);

router.patch(
  "/:id/reject",
  authenticate,
  authorize(Role.ADMIN),
  AdvisoryController.rejectAdvisory,
);

export default router;
