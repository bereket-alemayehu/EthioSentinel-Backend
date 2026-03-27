import { Request, Response } from "express";
import { RegionService } from "../services/region.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class RegionController {
  static getAllRegions = catchAsync(async (req: Request, res: Response) => {
    const regions = await RegionService.getAllRegions();
    return sendSuccess(res, regions, "Regions retrieved successfully");
  });
}
