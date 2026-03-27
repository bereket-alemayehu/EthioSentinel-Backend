import { Request, Response } from "express";
import { HealthService } from "../services/health.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class HealthController {
  static checkHealth = catchAsync(async (req: Request, res: Response) => {
    const health = await HealthService.checkHealth();
    return sendSuccess(res, health, "Health check successful");
  });
}
