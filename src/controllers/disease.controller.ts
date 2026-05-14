import { Request, Response } from "express";
import { DiseaseService } from "../services/disease.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";
import { AppError } from "../utils/AppError";

function auditMeta(req: Request) {
  const xf = req.headers["x-forwarded-for"];
  const ip =
    (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    null;
  return {
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    ip,
    userAgent: req.get("user-agent") || null,
  };
}

export class DiseaseController {
  static getAllDiseases = catchAsync(async (req: Request, res: Response) => {
    const diseases = await DiseaseService.getAllDiseases();
    return sendSuccess(res, diseases, "Diseases retrieved successfully");
  });

  static getCatalog = catchAsync(async (_req: Request, res: Response) => {
    const diseases = await DiseaseService.getDiseaseCatalog();
    return sendSuccess(res, diseases, "Disease catalog retrieved successfully");
  });

  static createDisease = catchAsync(async (req: Request, res: Response) => {
    const disease = await DiseaseService.createDisease(req.body, auditMeta(req));
    return sendSuccess(res, disease, "Disease created successfully", 201);
  });

  static updateDisease = catchAsync(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new AppError("Invalid disease id", 400);
    }
    const disease = await DiseaseService.updateDisease(id, req.body, auditMeta(req));
    return sendSuccess(res, disease, "Disease updated successfully");
  });

  static deleteDisease = catchAsync(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      throw new AppError("Invalid disease id", 400);
    }
    await DiseaseService.deleteDisease(id, auditMeta(req));
    return sendSuccess(res, { ok: true }, "Disease removed from catalog");
  });
}
