import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

export const diseasesRouter = Router();

diseasesRouter.get("/diseases", async (_req, res) => {
  try {
    const diseases = await prisma.disease.findMany({
      orderBy: { name: "asc" },
    });

    res.json(diseases);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

diseasesRouter.post(
  "/diseases",
  authenticate,
  authorize(UserRole.ADMIN),
  async (req, res) => {
    try {
      const { name, slug, description, symptomProfile, isActive } =
        req.body as {
          name?: string;
          slug?: string;
          description?: string;
          symptomProfile?: string;
          isActive?: boolean;
        };

      if (!name || !slug) {
        return res.status(400).json({ error: "name and slug are required" });
      }

      const disease = await prisma.disease.create({
        data: {
          name,
          slug,
          description,
          symptomProfile,
          isActive: isActive ?? true,
        },
      });

      return res.status(201).json(disease);
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  },
);
