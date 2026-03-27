import { Request, Response, NextFunction } from "express";
import type { UserRole } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

export const authorize = (...roles: UserRole[]) => {
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
