import { Request, Response } from "express";
import { ReportService } from "../services/report.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class ReportController {
  static getWeeklyReports = catchAsync(async (req: Request, res: Response) => {
    const weeklyData = await ReportService.getWeeklyAggregatedReports();
    const exportFormat = String(req.query.export ?? "json").toLowerCase();

    if (exportFormat === "pdf") {
      const pdfBuffer = await ReportService.exportWeeklyReportsPdf(weeklyData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="weekly-reports.pdf"',
      );
      return res.status(200).send(pdfBuffer);
    }

    if (exportFormat === "excel") {
      const excelBuffer =
        await ReportService.exportWeeklyReportsExcel(weeklyData);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="weekly-reports.xlsx"',
      );
      return res.status(200).send(excelBuffer);
    }

    return sendSuccess(
      res,
      weeklyData,
      "Weekly report summary retrieved successfully",
    );
  });

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
