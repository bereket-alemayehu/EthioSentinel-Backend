import { Request, Response } from "express";
import { DiseaseService } from "../services/disease.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class DiseaseController {
  static getAllDiseases = catchAsync(async (req: Request, res: Response) => {
    const diseases = await DiseaseService.getAllDiseases();
    return sendSuccess(res, diseases, "Diseases retrieved successfully");
  });

  static createDisease = catchAsync(async (req: Request, res: Response) => {
    const disease = await DiseaseService.createDisease(req.body);
    return sendSuccess(res, disease, "Disease created successfully", 201);
  });
}
