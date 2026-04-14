import { Router } from "express";
import { AdvisoryController } from "../controllers/advisory.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.post("/generate", AdvisoryController.generateAdvisoryText);

router.get("/", AdvisoryController.getAllAdvisories);

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

export default router;
