import { Request, Response } from "express";
import { env } from "../config/env.config";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

/** Public client config (no auth). */
export class ConfigController {
  static getPublic = catchAsync(async (_req: Request, res: Response) => {
    return sendSuccess(res, {
      recaptchaSiteKey: env.RECAPTCHA_SITE_KEY.trim(),
    });
  });
}
