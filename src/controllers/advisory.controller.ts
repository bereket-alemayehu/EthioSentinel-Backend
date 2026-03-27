import { Request, Response } from "express";
import { AdvisoryService } from "../services/advisory.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AdvisoryController {
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
}
