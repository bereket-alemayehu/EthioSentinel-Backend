import { Request, Response } from "express";
import { PublicHealthService } from "../services/public-health.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class PublicHealthController {
  static getEthiopiaRegionalStatus = catchAsync(
    async (req: Request, res: Response) => {
      const days = req.query.days ? Number(req.query.days) : undefined;
      const result = await PublicHealthService.getEthiopiaRegionalStatus(days);
      return sendSuccess(res, result, "Ethiopia regional health status retrieved");
    },
  );

  static getOutbreakNews = catchAsync(async (_req: Request, res: Response) => {
    const result = await PublicHealthService.getOutbreakNews();
    return sendSuccess(res, result, "Outbreak news retrieved");
  });
}
