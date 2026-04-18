import { Request, Response } from "express";
import { AdvisoryService } from "../services/advisory.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AdvisoryController {
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

  static getDraftAdvisories = catchAsync(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await AdvisoryService.getAdvisoryDrafts(page, limit);
    return sendSuccess(res, result, "Draft advisories retrieved successfully");
  });

  static rejectAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = String(req.params.id);
    const advisory = await AdvisoryService.rejectAdvisory(advisoryId);
    return sendSuccess(res, advisory, "Advisory rejected");
  });

  static createAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisory = await AdvisoryService.createAdvisory(req.body);
    return sendSuccess(res, advisory, "Advisory created successfully", 201);
  });

  static approveAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = String(req.params.id);
    const userId = req.user!.id;
    const advisory = await AdvisoryService.approveAdvisory(advisoryId, userId);
    return sendSuccess(res, advisory, "Advisory approved successfully");
  });
}
