import { Router } from "express";
import { HealthController } from "../controllers/health.controller";

const router = Router();

router.get("/", HealthController.checkHealth);
router.get("/facilities", HealthController.getHealthFacilities);
router.get("/facilities/with-indicators", HealthController.getHealthFacilitiesWithIndicators);

export default router;
