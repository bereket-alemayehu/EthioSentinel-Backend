import { Request, Response, NextFunction } from "express";
import type { Role } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

/**
 * Role policy summary (spec-enforced):
 *
 *  CITIZEN    — public / unauthenticated access only.
 *               Never appears in an authorize() tuple.
 *               Any CITIZEN-role JWT hitting a protected route correctly receives 403.
 *
 *  HEW        — district-scoped field workers.
 *               May submit reports (POST /reports) and read reports (GET /reports, /reports/weekly).
 *               District scoping is enforced in report.service.ts, not here.
 *               authorize(Role.HEW, Role.ADMIN)
 *
 *  ADMIN      — full access: all data, approvals, alerts, user management, AI triggers.
 *               Always included in every protected tuple.
 *
 *  RESEARCHER — read-only analytics.
 *               May GET reports, alerts, advisories, and user listings.
 *               Must never appear on mutation endpoints (POST / PATCH / PUT / DELETE).
 *               authorize(Role.ADMIN, Role.RESEARCHER) on GET-only routes.
 */
export const authorize = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError("Forbidden - Access denied", 403));
    }

    return next();
  };
};
