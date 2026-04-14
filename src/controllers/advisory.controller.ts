import { Request, Response } from "express";
import { AdvisoryService } from "../services/advisory.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";
import { AdvisoryStatus, Language, RiskLevel } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

export class AdvisoryController {
  private static parseOptionalInt(value: unknown, field: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError(`${field} must be a positive integer`, 400);
    }

    return parsed;
  }

  static symptomCheck = catchAsync(async (req: Request, res: Response) => {
    const result = AdvisoryService.checkSymptoms(req.body);
    return sendSuccess(res, result, "Symptom assessment completed");
  });

  static generateAdvisoryText = catchAsync(
    async (req: Request, res: Response) => {
      const advisory = AdvisoryService.generateHealthAdvisoryText(req.body);
      return sendSuccess(res, advisory, "Advisory text generated successfully");
    },
  );

  static getAllAdvisories = catchAsync(async (req: Request, res: Response) => {
    const advisories = await AdvisoryService.getAllAdvisories();
    return sendSuccess(res, advisories, "Advisories retrieved successfully");
  });

  static createAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisory = await AdvisoryService.createAdvisory(req.body);
    return sendSuccess(res, advisory, "Advisory created successfully", 201);
  });

  static approveAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = Number(req.params.id);
    const userId = req.user!.id;
    const advisory = await AdvisoryService.approveAdvisory(advisoryId, userId);
    return sendSuccess(res, advisory, "Advisory approved successfully");
  });

  static getDraftAdvisoryQueue = catchAsync(async (req: Request, res: Response) => {
    const page = this.parseOptionalInt(req.query.page, "page");
    const limit = this.parseOptionalInt(req.query.limit, "limit");
    const diseaseId = this.parseOptionalInt(req.query.diseaseId, "diseaseId");
    const regionId = this.parseOptionalInt(req.query.regionId, "regionId");
    const districtId = this.parseOptionalInt(req.query.districtId, "districtId");
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const riskLevelRaw =
      typeof req.query.riskLevel === "string"
        ? req.query.riskLevel.trim().toUpperCase()
        : undefined;
    const languageRaw =
      typeof req.query.language === "string"
        ? req.query.language.trim().toUpperCase()
        : undefined;

    if (riskLevelRaw && !Object.values(RiskLevel).includes(riskLevelRaw as RiskLevel)) {
      throw new AppError("riskLevel must be one of LOW, MODERATE, HIGH, CRITICAL", 400);
    }

    if (languageRaw && !Object.values(Language).includes(languageRaw as Language)) {
      throw new AppError("language must be ENGLISH or AMHARIC", 400);
    }

    const result = await AdvisoryService.getDraftAdvisoryQueue({
      page,
      limit,
      search,
      diseaseId,
      regionId,
      districtId,
      riskLevel: riskLevelRaw as RiskLevel | undefined,
      language: languageRaw as Language | undefined,
    });

    return sendSuccess(
      res,
      result,
      "AI draft advisories retrieved successfully",
    );
  });

  static transitionDraftAdvisoryStatus = catchAsync(
    async (req: Request, res: Response) => {
      const advisoryId = Number(req.params.id);
      const statusRaw = String(req.body?.status ?? "")
        .trim()
        .toUpperCase();

      const allowedTransitions = [
        AdvisoryStatus.APPROVED,
        AdvisoryStatus.REJECTED,
        AdvisoryStatus.ARCHIVED,
      ] as const;

      if (!allowedTransitions.includes(statusRaw as (typeof allowedTransitions)[number])) {
        throw new AppError("status must be APPROVED, REJECTED, or ARCHIVED", 400);
      }

      const advisory = await AdvisoryService.transitionDraftAdvisoryStatus(
        advisoryId,
        statusRaw as "APPROVED" | "REJECTED" | "ARCHIVED",
        req.user!.id,
      );

      return sendSuccess(res, advisory, `Advisory transitioned to ${statusRaw}`);
    },
  );
}
