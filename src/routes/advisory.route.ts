import { Router } from "express";
import { AdvisoryController } from "../controllers/advisory.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "../../generated/prisma/enums";

const router = Router();

router.post("/symptom-check", AdvisoryController.symptomCheck);

router.post("/generate", AdvisoryController.generateAdvisoryText);

router.get("/", AdvisoryController.getAllAdvisories);

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

export default router;
