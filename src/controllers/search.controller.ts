import { Request, Response } from "express";
import { SearchService } from "../services/search.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class SearchController {
  static globalSearch = catchAsync(async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "");
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await SearchService.globalSearch(q, limit);
    return sendSuccess(res, result, "Search completed");
  });
}
