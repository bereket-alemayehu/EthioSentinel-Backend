import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";

export class AuthController {
  static login = catchAsync(async (req: Request, res: Response) => {
    const { identifier, email, username, password } = req.body;
    const loginIdentifier = identifier ?? username ?? email;
    const { accessToken, user } = await AuthService.login(loginIdentifier, password);

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches default JWT_EXPIRES_IN)
    });

    return sendSuccess(res, { user }, "Login successful");
  });

  static logout = catchAsync(async (req: Request, res: Response) => {
    res.clearCookie("accessToken");
    return sendSuccess(res, null, "Logged out successfully");
  });

  static getMe = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const user = await AuthService.getMe(userId);
    return sendSuccess(res, user, "User profile retrieved");
  });
}
