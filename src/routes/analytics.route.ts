import { Router } from "express";
import { AnalyticsController } from "../controllers/analytics.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

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

/**
 * GET /analytics/geo-stats
 * Returns case counts grouped by district with coordinates.
 */
router.get(
  "/geo-stats",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AnalyticsController.getGeoStats,
);

export default router;
