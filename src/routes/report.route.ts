import { Router } from "express";
import { ReportController } from "../controllers/report.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

const router = Router();

router.get(
  "/weekly",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.RESEARCHER, Role.SUPER_ADMIN),
  ReportController.getWeeklyReports,
);

router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.RESEARCHER, Role.SUPER_ADMIN),
  ReportController.getAllReports,
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.SUPER_ADMIN),
  ReportController.createReport,
);

// BR-05: batch offline sync — mortality reports are persisted before morbidity
router.post(
  "/sync",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.SUPER_ADMIN),
  ReportController.syncOfflineBatch,
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.SUPER_ADMIN),
  ReportController.updateReport,
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.HEW, Role.SUPER_ADMIN),
  ReportController.deleteReport,
);

export default router;
