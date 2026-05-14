import { Router } from "express";
import authRoutes from "./auth.route";
import userRoutes from "./user.route";
import reportRoutes from "./report.route";
import alertRoutes from "./alert.route";
import regionRoutes from "./region.route";
import diseaseRoutes from "./disease.route";
import advisoryRoutes from "./advisory.route";
import healthRoutes from "./health.route";
import adminRoutes from "./admin.route";
import superAdminRoutes from "./super-admin.route";
import aiRoutes from "./ai.route";
import analyticsRoutes from "./analytics.route";
import searchRoutes from "./search.route";
import publicHealthRoutes from "./public-health.route";
import swaggerRoutes from "./swagger/swagger.config";

const router = Router();

router.use("/docs", swaggerRoutes);
router.use("/auth", authRoutes);
router.use("/search", searchRoutes);
router.use("/users", userRoutes);
router.use("/reports", reportRoutes);
router.use("/alerts", alertRoutes);
router.use("/regions", regionRoutes);
router.use("/diseases", diseaseRoutes);
router.use("/advisories", advisoryRoutes);
router.use("/health", healthRoutes);
router.use("/admin", adminRoutes);
router.use("/super-admin", superAdminRoutes);
router.use("/ai", aiRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/public-health", publicHealthRoutes);

export default router;
