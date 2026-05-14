import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
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
 *  ADMIN      — full operational access: approvals, alerts, map, analytics, AI triggers.
 *
 *  SUPER_ADMIN — governance (super-admin routes) plus the same operational access as ADMIN
 *               wherever authorize() includes both roles.
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
