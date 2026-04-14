import { Router } from "express";
import { ReportController } from "../controllers/report.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.get(
  "/weekly",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW, UserRole.RESEARCHER),
  ReportController.getWeeklyReports,
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW, UserRole.RESEARCHER),
  ReportController.getAllReports,
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW),
  ReportController.createReport,
);

export default router;
