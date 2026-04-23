import { Router } from "express";
import { AnalyticsController } from "../controllers/analytics.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "../../generated/prisma/enums";

const router = Router();

/**
 * GET /analytics/reports
 * Query params: startDate, endDate, district, diseaseType, page, limit, export (json|pdf|excel)
 * RESEARCHER gets read-only access; ADMIN gets full access.
 */
router.get(
  "/reports",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AnalyticsController.getAggregatedReports,
);

export default router;
