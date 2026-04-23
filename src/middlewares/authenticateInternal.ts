import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.config";
import { AppError } from "../utils/AppError";

/**
 * Middleware for machine-to-machine internal endpoints (e.g. Python AI worker).
 * Validates a static shared secret passed in the `x-internal-token` header.
 * Not JWT-based — the caller is a service, not a human user.
 *
 * If AI_INTERNAL_TOKEN is empty (local dev), the check is skipped.
 */
export const authenticateInternal = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!env.AI_INTERNAL_TOKEN) {
    return next();
  }

  const token = req.header("x-internal-token");

  if (!token || token !== env.AI_INTERNAL_TOKEN) {
    return next(new AppError("Unauthorized internal request", 401));
  }

  return next();
};
