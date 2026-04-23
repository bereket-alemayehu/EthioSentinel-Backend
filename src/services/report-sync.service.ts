import { prisma } from "../lib/prisma";
import { ReportStatus, Role } from "../../generated/prisma/enums";
import { AIService } from "./ai.service";
import { AlertService } from "./alert.service";
import { logger } from "../utils/logger";
import { validateAndSanitizeReport } from "../validations/report.validation";
import { AppError } from "../utils/AppError";

type OfflineReportItem = {
  district?: unknown;
  diseaseType?: unknown;
  caseCount?: unknown;
  deathCount?: unknown;
  notes?: unknown;
  isOfflineCached?: unknown;
};

type SyncUser = { id: string; role: Role };

type SyncResult = {
  accepted: number;
  rejected: number;
  errors: Array<{ index: number; reason: string }>;
};

/**
 * BR-05: Offline sync service.
 * Accepts a batch of reports from a PWA and persists them with
 * mortality-first ordering (reports with deathCount > 0 are processed before
 * morbidity-only reports). Uses a single Prisma transaction so the entire
 * batch succeeds or rolls back together.
 */
export class ReportSyncService {
  static async syncOfflineBatch(
    items: OfflineReportItem[],
    user: SyncUser,
  ): Promise<SyncResult> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Sync payload must be a non-empty array of reports", 400);
    }

    if (items.length > 200) {
      throw new AppError("Batch size cannot exceed 200 reports per sync", 400);
    }

    type ValidItem = {
      index: number;
      district: string;
      diseaseType: string;
      caseCount: number;
      deathCount: number;
      notes: string | undefined;
      isOfflineCached: boolean;
    };

    const valid: ValidItem[] = [];
    const errors: SyncResult["errors"] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const s = validateAndSanitizeReport(items[i]);
        valid.push({ index: i, ...s });
      } catch (err) {
        errors.push({
          index: i,
          reason: err instanceof Error ? err.message : "Validation failed",
        });
      }
    }

    if (valid.length === 0) {
      return { accepted: 0, rejected: errors.length, errors };
    }

    // BR-05: mortality-first ordering — deathCount > 0 reports go first
    const sorted = [...valid].sort((a, b) => {
      const aMortality = a.deathCount > 0 ? 0 : 1;
      const bMortality = b.deathCount > 0 ? 0 : 1;
      return aMortality - bMortality;
    });

    const effectiveReporterId = user.id;

    const createdReports = await prisma.$transaction(
      sorted.map((item) =>
        prisma.diseaseReport.create({
          data: {
            district: item.district,
            diseaseType: item.diseaseType,
            reporterId: effectiveReporterId,
            caseCount: item.caseCount,
            deathCount: item.deathCount,
            isOfflineCached: true,
            status: ReportStatus.PENDING,
            isMortalityPriority: item.deathCount > 0,
            notes: item.notes,
          },
          select: { id: true, diseaseType: true, district: true },
        }),
      ),
    );

    logger.info("Offline sync batch persisted", {
      userId: user.id,
      accepted: createdReports.length,
      rejected: errors.length,
      mortalityFirst: sorted.filter((r) => r.deathCount > 0).length,
    });

    // Fire post-persist hooks non-blocking for each created report
    for (const report of createdReports) {
      AIService.enqueueZScoreAnomalyTrigger(report.id);

      setImmediate(async () => {
        try {
          await AlertService.checkAndCreateCriticalMortalityAlert(
            report.diseaseType,
            report.district,
          );
        } catch (err) {
          logger.error("BR-03 check failed during sync", { reportId: report.id, err });
        }
      });
    }

    return {
      accepted: createdReports.length,
      rejected: errors.length,
      errors,
    };
  }
}
