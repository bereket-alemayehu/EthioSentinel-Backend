import { Request, Response } from "express";
import { AlertService } from "../services/alert.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AlertController {
  static getAllAlerts = catchAsync(async (req: Request, res: Response) => {
    const alerts = await AlertService.getAllAlerts();
    return sendSuccess(res, alerts, "Alerts retrieved successfully");
  });

  static createAlert = catchAsync(async (req: Request, res: Response) => {
    const alertData = {
      ...req.body,
      userId: req.user!.id,
    };
    const alert = await AlertService.createAlert(alertData);
    return sendSuccess(res, alert, "Alert created successfully", 201);
  });
}
