import { Request, Response } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AnalyticsController {
  static getAggregatedReports = catchAsync(
    async (req: Request, res: Response) => {
      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        district: req.query.district as string | undefined,
        diseaseType: req.query.diseaseType as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };

      const exportFormat = String(req.query.export ?? "json").toLowerCase();
      const result = await AnalyticsService.getAggregatedReports(filters);

      if (exportFormat === "pdf") {
        const buf = await AnalyticsService.exportAggregatedPdf(result);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="analytics.pdf"',
        );
        return res.status(200).send(buf);
      }

      if (exportFormat === "excel") {
        const buf = await AnalyticsService.exportAggregatedExcel(result);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="analytics.xlsx"',
        );
        return res.status(200).send(buf);
      }

      return sendSuccess(res, result, "Analytics retrieved successfully");
    },
  );
}
