import { Request, Response } from "express";
import { AlertService } from "../services/alert.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AlertController {
  static getAlertById = catchAsync(async (req: Request, res: Response) => {
    const alertId = String(req.params.id);
    const alert = await AlertService.getAlertById(alertId);
    return sendSuccess(res, alert, "Alert retrieved successfully");
  });

  static getAllAlerts = catchAsync(async (req: Request, res: Response) => {
    const aiSuggestedRaw = req.query.aiSuggested;
    const aiSuggested =
      typeof aiSuggestedRaw === "string"
        ? aiSuggestedRaw.toLowerCase() === "true"
          ? true
          : aiSuggestedRaw.toLowerCase() === "false"
            ? false
            : undefined
        : undefined;

    const alerts = await AlertService.getAllAlerts({ aiSuggested });
    return sendSuccess(res, alerts, "Alerts retrieved successfully");
  });

  static approveAlert = catchAsync(async (req: Request, res: Response) => {
    const alertId = String(req.params.id);
    const alert = await AlertService.approveAlert(alertId, req.user!.id);
    return sendSuccess(res, alert, "Alert approved successfully");
  });

  static rejectAlert = catchAsync(async (req: Request, res: Response) => {
    const alertId = String(req.params.id);
    const alert = await AlertService.rejectAlert(alertId, req.user!.id);
    return sendSuccess(res, alert, "Alert rejected successfully");
  });

  static createAlert = catchAsync(async (req: Request, res: Response) => {
    const alertData = {
      ...req.body,
      userId: req.user!.id,
    };
    const alert = await AlertService.createAlert(alertData);
    return sendSuccess(res, alert, "Alert created successfully", 201);
  });

  static getNotifications = catchAsync(
    async (req: Request, res: Response) => {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const notifications = await AlertService.getNotificationsForUserId(
        req.user!.id,
        limit,
      );
      return sendSuccess(
        res,
        notifications,
        "Notifications retrieved successfully",
      );
    },
  );
}
