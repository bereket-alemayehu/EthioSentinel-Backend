import { Router } from "express";
import { DiseaseController } from "../controllers/disease.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { UserRole } from "../../generated/prisma/enums";

const router = Router();

router.get("/", DiseaseController.getAllDiseases);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  DiseaseController.createDisease
);

export default router;
