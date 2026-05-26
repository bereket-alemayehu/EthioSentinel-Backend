import { Request, Response } from "express";
import { HealthService } from "../services/health.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class HealthController {
  static checkHealth = catchAsync(async (req: Request, res: Response) => {
    const health = await HealthService.checkHealth();
    return sendSuccess(res, health, "Health check successful");
  });

  static getHealthFacilities = catchAsync(async (req: Request, res: Response) => {
    const facilities = await HealthService.getHealthFacilities();
    return sendSuccess(res, facilities, "Health facilities retrieved successfully");
  });

  static getHealthFacilitiesWithIndicators = catchAsync(
    async (req: Request, res: Response) => {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      const facilities =
        await HealthService.getHealthFacilitiesWithDiseaseIndicators(days);
      return sendSuccess(
        res,
        facilities,
        "Health facilities with disease indicators retrieved successfully",
      );
    },
  );
}
