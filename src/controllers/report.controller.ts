import { Request, Response } from "express";
import { ReportService } from "../services/report.service";
import { ReportSyncService } from "../services/report-sync.service";
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
    const filters: { reporterId?: string } = {};
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // HEWs should only see their own reports
    if (req.user?.role === "HEW") {
      filters.reporterId = req.user.id;
    }
    
    const result = await ReportService.getAllReports(filters, page, limit);
    return sendSuccess(res, result, "Reports retrieved successfully");
  });

  static createReport = catchAsync(async (req: Request, res: Response) => {
    const reportData = {
      ...req.body,
      user: req.user,
    };
    const report = await ReportService.createReport(reportData);
    return sendSuccess(res, report, "Report created successfully", 201);
  });

  static syncOfflineBatch = catchAsync(async (req: Request, res: Response) => {
    const result = await ReportSyncService.syncOfflineBatch(
      req.body.reports,
      req.user!,
    );
    return sendSuccess(res, result, "Offline sync completed", 207);
  });

  static updateReport = catchAsync(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const report = await ReportService.updateReport(id, {
      ...req.body,
      userId: req.user!.id,
    });
    return sendSuccess(res, report, "Report updated successfully");
  });

  static deleteReport = catchAsync(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await ReportService.deleteReport(id, req.user!.id);
    return sendSuccess(res, null, "Report deleted successfully");
  });
}
