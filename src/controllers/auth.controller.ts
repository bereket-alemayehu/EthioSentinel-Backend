import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AuthController {
  static register = catchAsync(async (req: Request, res: Response) => {
    const user = await AuthService.register(req.body);
    return sendSuccess(res, { user }, "Account created successfully", 201);
  });

  static login = catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const { accessToken, user } = await AuthService.login(email, password);

    const cookieOpts = {
      httpOnly: true as const,
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches default JWT_EXPIRES_IN)
    };

    res.cookie("accessToken", accessToken, cookieOpts);

    return sendSuccess(res, { user }, "Login successful");
  });

  static logout = catchAsync(async (req: Request, res: Response) => {
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
    return sendSuccess(res, null, "Logged out successfully");
  });

  static getMe = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const user = await AuthService.getMe(userId);
    return sendSuccess(res, { user }, "User profile retrieved");
  });

  static updateMeGeolocation = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const lat = Number((req.body as { latitude?: unknown }).latitude);
    const lng = Number((req.body as { longitude?: unknown }).longitude);
    const { user } = await AuthService.updateGeolocation(userId, lat, lng);
    return sendSuccess(res, { user }, "Location updated from device");
  });
}
