import {
  AdvisoryStatus,
  Language,
  RiskLevel,
  UserRole,
} from "../../generated/prisma/enums";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

export const advisoriesRouter = Router();

advisoriesRouter.get("/advisories", async (_req, res) => {
  try {
    const advisories = await prisma.advisory.findMany({
      include: {
        disease: true,
        region: true,
        district: true,
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(advisories);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

advisoriesRouter.post(
  "/advisories",
  authenticate,
  authorize(UserRole.ADMIN),
  async (req, res) => {
    try {
      const {
        diseaseId,
        regionId,
        districtId,
        sourceReportId,
        approvedById,
        title,
        content,
        language,
        status,
        riskLevel,
        generatedByAI,
      } = req.body as {
        diseaseId?: number;
        regionId?: number;
        districtId?: number;
        sourceReportId?: number;
        approvedById?: number;
        title?: string;
        content?: string;
        language?: Language;
        status?: AdvisoryStatus;
        riskLevel?: RiskLevel;
        generatedByAI?: boolean;
      };

      if (!diseaseId || !regionId || !title || !content) {
        return res.status(400).json({
          error: "diseaseId, regionId, title and content are required",
        });
      }

      const advisory = await prisma.advisory.create({
        data: {
          diseaseId,
          regionId,
          districtId,
          sourceReportId,
          approvedById,
          title,
          content,
          language: language ?? Language.AMHARIC,
          status: status ?? AdvisoryStatus.DRAFT,
          riskLevel: riskLevel ?? RiskLevel.MODERATE,
          generatedByAI: generatedByAI ?? true,
          approvedAt:
            status === AdvisoryStatus.APPROVED ? new Date() : undefined,
        },
      });

      return res.status(201).json(advisory);
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  },
);

advisoriesRouter.patch(
  "/advisories/:id/approve",
  authenticate,
  authorize(UserRole.ADMIN),
  async (req, res) => {
    try {
      const advisoryId = Number(req.params.id);

      if (Number.isNaN(advisoryId)) {
        return res.status(400).json({ error: "Invalid advisory id" });
      }

      const advisory = await prisma.advisory.update({
        where: { id: advisoryId },
        data: {
          status: AdvisoryStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: req.user!.id,
        },
      });

      return res.json(advisory);
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  },
);
