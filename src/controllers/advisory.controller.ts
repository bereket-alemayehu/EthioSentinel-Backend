import { Request, Response } from "express";
import { AdvisoryService } from "../services/advisory.service";
import { ChatService } from "../services/chat.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AdvisoryController {
  static getChatHistory = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const messages = await ChatService.getChatHistory(userId);
    return sendSuccess(res, messages, "Chat history retrieved");
  });

  static sendChatMessage = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { message, language } = req.body as { message?: string; language?: string };
    const reply = await ChatService.sendMessage({ userId, message: message ?? "", language });
    return sendSuccess(res, reply, "Chat reply generated");
  });

  static sendPublicChatMessage = catchAsync(async (req: Request, res: Response) => {
    const { message, language } = req.body as { message?: string; language?: string };
    const reply = await ChatService.sendPublicMessage({ message: message ?? "", language });
    return sendSuccess(res, reply, "Public chat reply generated");
  });

  static clearChatHistory = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    await ChatService.clearChatHistory(userId);
    return sendSuccess(res, null, "Chat history cleared");
  });

  static symptomCheck = catchAsync(async (req: Request, res: Response) => {
    const result = AdvisoryService.checkSymptoms(req.body);
    return sendSuccess(res, result, "Symptom assessment completed");
  });

  static generateAdvisoryText = catchAsync(
    async (req: Request, res: Response) => {
      const advisory = AdvisoryService.generateHealthAdvisoryText(req.body);
      return sendSuccess(res, advisory, "Advisory text generated successfully");
    },
  );

  static getAdvisoryById = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = String(req.params.id);
    const advisory = await AdvisoryService.getAdvisoryById(advisoryId);
    return sendSuccess(res, advisory, "Advisory retrieved successfully");
  });

  static getAllAdvisories = catchAsync(async (req: Request, res: Response) => {
    const language =
      typeof req.query.language === "string" ? req.query.language : undefined;
    const advisories = await AdvisoryService.getAllAdvisories(language);
    return sendSuccess(res, advisories, "Advisories retrieved successfully");
  });

  static getDiseaseAdvisories = catchAsync(async (req: Request, res: Response) => {
    const diseaseId = String(req.params.id);
    const advisories = await AdvisoryService.getAdvisoriesByDisease(diseaseId);
    return sendSuccess(res, advisories, "Advisories retrieved successfully");
  });

  static getDraftAdvisories = catchAsync(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await AdvisoryService.getAdvisoriesByStatus("DRAFT" as any, page, limit);
    return sendSuccess(res, result, "Draft advisories retrieved successfully");
  });

  static getApprovedAdvisories = catchAsync(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await AdvisoryService.getAdvisoriesByStatus("APPROVED" as any, page, limit);
    return sendSuccess(res, result, "Approved advisories retrieved successfully");
  });

  static rejectAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = String(req.params.id);
    const advisory = await AdvisoryService.rejectAdvisory(
      advisoryId,
      req.user!.id,
    );
    return sendSuccess(res, advisory, "Advisory rejected");
  });

  static createAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisory = await AdvisoryService.createAdvisory(req.body);
    return sendSuccess(res, advisory, "Advisory created successfully", 201);
  });

  static approveAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = String(req.params.id);
    const userId = req.user!.id;
    const advisory = await AdvisoryService.approveAdvisory(advisoryId, userId);
    return sendSuccess(res, advisory, "Advisory approved successfully");
  });

  static withdrawAdvisory = catchAsync(async (req: Request, res: Response) => {
    const advisoryId = String(req.params.id);
    const advisory = await AdvisoryService.withdrawAdvisory(
      advisoryId,
      req.user!.id,
    );
    return sendSuccess(res, advisory, "Advisory withdrawn successfully");
  });
}
