import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";
import { prisma } from "../lib/prisma";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.cookies.accessToken;

  if (!token) {
    return next(new AppError("Authentication required", 401));
  }

  try {
    const payload = verifyAccessToken(token);

    const row = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { tokenVersion: true, isActive: true },
    });

    if (!row || !row.isActive) {
      return next(new AppError("Authentication required", 401));
    }

    if (row.tokenVersion !== (payload.tokenVersion ?? 0)) {
      return next(
        new AppError("Session invalidated. Please sign in again.", 401),
      );
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    return next(new AppError("Invalid or expired token", 401));
  }
};
