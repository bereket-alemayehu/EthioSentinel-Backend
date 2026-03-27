import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.accessToken;

  if (!token) {
    return next(new AppError("Authentication required", 401));
  }

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch (err) {
    return next(new AppError("Invalid or expired token", 401));
  }
};
