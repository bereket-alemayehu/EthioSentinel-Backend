import { Request, Response } from "express";
import { ReportService } from "../services/report.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class ReportController {
  static getAllReports = catchAsync(async (req: Request, res: Response) => {
    const reports = await ReportService.getAllReports();
    return sendSuccess(res, reports, "Reports retrieved successfully");
  });

  static createReport = catchAsync(async (req: Request, res: Response) => {
    const reportData = {
      ...req.body,
      user: req.user,
    };
    const report = await ReportService.createReport(reportData);
    return sendSuccess(res, report, "Report created successfully", 201);
  });
}
