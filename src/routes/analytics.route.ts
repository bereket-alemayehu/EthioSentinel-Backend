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

/**
 * GET /analytics/anomalies
 * Lists persisted AnomalySignal rows. Supports `export=csv`.
 */
router.get(
  "/anomalies",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AnalyticsController.getAnomalies,
);

/**
 * GET /analytics/anomalies/timeseries?district=&diseaseType=&days=
 * Daily case counts for a district+disease window with mean / sigma bands.
 */
router.get(
  "/anomalies/timeseries",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AnalyticsController.getAnomalyTimeseries,
);

/**
 * POST /analytics/anomalies/run
 * Body: { district, diseaseType, lookbackDays?, persist?, notes? }
 * Runs the Python /detect z-score endpoint ad-hoc on stored reports.
 */
router.post(
  "/anomalies/run",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AnalyticsController.runAnomaly,
);

export default router;
