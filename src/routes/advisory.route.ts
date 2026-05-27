import { Router } from "express";
import { AdvisoryController } from "../controllers/advisory.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

const router = Router();

router.get("/chat/history", authenticate, AdvisoryController.getChatHistory);
router.post("/chat/message", authenticate, AdvisoryController.sendChatMessage);
router.post("/chat/public/message", AdvisoryController.sendPublicChatMessage);
router.delete("/chat/history", authenticate, AdvisoryController.clearChatHistory);

router.post("/symptom-check", AdvisoryController.symptomCheck);

router.post(
  "/generate",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.SUPER_ADMIN),
  AdvisoryController.generateAdvisoryText,
);

router.get("/", AdvisoryController.getAllAdvisories);

router.get(
  "/drafts",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AdvisoryController.getDraftAdvisories,
);

router.get(
  "/approved-list",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AdvisoryController.getApprovedAdvisories,
);

router.get(
  "/:id",
  authenticate,
  AdvisoryController.getAdvisoryById,
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AdvisoryController.createAdvisory,
);

router.patch(
  "/:id/approve",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AdvisoryController.approveAdvisory,
);

router.patch(
  "/:id/reject",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AdvisoryController.rejectAdvisory,
);

router.patch(
  "/:id/withdraw",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  AdvisoryController.withdrawAdvisory,
);

export default router;
