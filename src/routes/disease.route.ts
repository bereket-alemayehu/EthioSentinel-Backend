import { Router } from "express";
import { DiseaseController } from "../controllers/disease.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

const router = Router();

router.get("/", DiseaseController.getAllDiseases);

router.get(
  "/catalog",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  DiseaseController.getCatalog,
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  DiseaseController.createDisease,
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  DiseaseController.updateDisease,
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  DiseaseController.deleteDisease,
);

export default router;
