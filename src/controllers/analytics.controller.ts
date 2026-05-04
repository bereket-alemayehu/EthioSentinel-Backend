import { Request, Response } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { AIService } from "../services/ai.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";
import { AppError } from "../utils/AppError";

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

      if (exportFormat === "csv") {
        const buf = await AnalyticsService.exportAggregatedCsv(result);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="analytics.csv"',
        );
        return res.status(200).send(buf);
      }

      return sendSuccess(res, result, "Analytics retrieved successfully");
    },
  );

  static getGeoStats = catchAsync(async (req: Request, res: Response) => {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      diseaseType: req.query.diseaseType as string | undefined,
    };

    const result = await AnalyticsService.getGeoAggregatedReports(filters);
    return sendSuccess(res, result, "Geo-stats retrieved successfully");
  });

  static getAnomalies = catchAsync(async (req: Request, res: Response) => {
    const classification =
      typeof req.query.classification === "string"
        ? (String(req.query.classification).toUpperCase() as
            | "ANOMALY"
            | "NORMAL")
        : undefined;

    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      district: req.query.district as string | undefined,
      diseaseType: req.query.diseaseType as string | undefined,
      classification:
        classification === "ANOMALY" || classification === "NORMAL"
          ? classification
          : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };

    const exportFormat = String(req.query.export ?? "json").toLowerCase();
    const result = await AnalyticsService.getAnomalySignals(filters);

    if (exportFormat === "csv") {
      const buf = await AnalyticsService.exportAnomaliesCsv(result.data);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="anomalies.csv"',
      );
      return res.status(200).send(buf);
    }

    return sendSuccess(res, result, "Anomaly signals retrieved successfully");
  });

  static getAnomalyTimeseries = catchAsync(
    async (req: Request, res: Response) => {
      const district = req.query.district as string | undefined;
      const diseaseType = req.query.diseaseType as string | undefined;
      const days = req.query.days ? Number(req.query.days) : undefined;

      if (!district || !diseaseType) {
        throw new AppError(
          "district and diseaseType query params are required",
          400,
        );
      }

      const result = await AnalyticsService.getAnomalyTimeseries({
        district,
        diseaseType,
        days,
      });
      return sendSuccess(res, result, "Anomaly timeseries computed");
    },
  );

  static runAnomaly = catchAsync(async (req: Request, res: Response) => {
    const district = req.body?.district as string | undefined;
    const diseaseType = req.body?.diseaseType as string | undefined;
    const lookbackDays = req.body?.lookbackDays
      ? Number(req.body.lookbackDays)
      : undefined;
    const persist = Boolean(req.body?.persist);
    const notes = req.body?.notes as string | undefined;

    if (!district || !diseaseType) {
      throw new AppError("district and diseaseType are required", 400);
    }

    try {
      const result = await AIService.runAdHocZScore({
        district,
        diseaseType,
        lookbackDays,
        persist,
        notes,
      });
      return sendSuccess(res, result, "Ad-hoc Z-score analysis completed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ad-hoc analysis failed";
      throw new AppError(message, 400);
    }
  });
}
