import { Request, Response } from "express";
import { AIService } from "../services/ai.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";
import { env } from "../config/env.config";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export class AIController {
  static triggerZScoreForReport = catchAsync(
    async (req: Request, res: Response) => {
      const reportId = String(req.params.reportId);
      if (!reportId) {
        throw new AppError("Invalid report id", 400);
      }

      AIService.enqueueZScoreAnomalyTrigger(reportId);
      return sendSuccess(
        res,
        { reportId, accepted: true },
        "Anomaly trigger accepted",
        202,
      );
    },
  );

  static ingestAnomalyWebhook = catchAsync(async (req: Request, res: Response) => {
    if (env.AI_WEBHOOK_TOKEN) {
      const suppliedToken =
        req.header("x-ai-webhook-token") ??
        req.header("authorization")?.replace(/^Bearer\s+/i, "");

      if (suppliedToken !== env.AI_WEBHOOK_TOKEN) {
        throw new AppError("Unauthorized webhook request", 401);
      }
    }

    logger.info("AI webhook payload received", req.body);

    return sendSuccess(
      res,
      { received: true },
      "AI webhook ingested successfully",
    );
  });

  /**
   * POST /ai/nlp/advisory-draft
   * Called by the internal Python AI worker to push a multi-language advisory draft.
   * Protected by authenticateInternal middleware (API key, not JWT).
   */
  static ingestNlpAdvisoryDraft = catchAsync(
    async (req: Request, res: Response) => {
      const { diseaseType, regionName, language, riskLevel, title, content, sourceReportId } =
        req.body as {
          diseaseType?: string;
          regionName?: string;
          language?: string;
          riskLevel?: string;
          title?: string;
          content?: string;
          sourceReportId?: string;
        };

      if (!diseaseType || !regionName || !language || !title || !content) {
        throw new AppError(
          "diseaseType, regionName, language, title, and content are required",
          400,
        );
      }

      const advisory = await AIService.persistNlpAdvisoryDraft({
        diseaseType,
        regionName,
        language,
        riskLevel,
        title,
        content,
        sourceReportId,
      });

      return sendSuccess(
        res,
        { id: advisory.id, status: "DRAFT" },
        "Advisory draft persisted",
        201,
      );
    },
  );
}
