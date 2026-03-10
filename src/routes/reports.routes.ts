import {
  ReportSource,
  ReportStatus,
  UserRole,
} from "../../generated/prisma/enums";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

export const reportsRouter = Router();

reportsRouter.get(
  "/reports",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW, UserRole.RESEARCHER),
  async (_req, res) => {
    try {
      const reports = await prisma.diseaseReport.findMany({
        include: {
          disease: true,
          district: true,
          reporter: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          reportDate: "desc",
        },
      });

      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },
);

reportsRouter.post(
  "/reports",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HEW),
  async (req, res) => {
    try {
      const {
        districtId,
        diseaseId,
        reporterId,
        reportDate,
        caseCount,
        deathCount,
        source,
        status,
        notes,
      } = req.body as {
        districtId?: number;
        diseaseId?: number;
        reporterId?: number;
        reportDate?: string;
        caseCount?: number;
        deathCount?: number;
        source?: ReportSource;
        status?: ReportStatus;
        notes?: string;
      };

      if (!districtId || !diseaseId || !reportDate) {
        return res.status(400).json({
          error: "districtId, diseaseId and reportDate are required",
        });
      }

      const effectiveReporterId =
        req.user!.role === UserRole.HEW ? req.user!.id : reporterId;

      if (!effectiveReporterId) {
        return res.status(400).json({ error: "reporterId is required" });
      }

      const diseaseReport = await prisma.diseaseReport.create({
        data: {
          districtId,
          diseaseId,
          reporterId: effectiveReporterId,
          reportDate: new Date(reportDate),
          caseCount: caseCount ?? 0,
          deathCount: deathCount ?? 0,
          source: source ?? ReportSource.PWA_ONLINE,
          status: status ?? ReportStatus.PENDING,
          isMortalityPriority: (deathCount ?? 0) > 0,
          notes,
        },
        include: {
          disease: true,
          district: true,
        },
      });

      return res.status(201).json(diseaseReport);
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  },
);
