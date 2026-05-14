import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";
import { RecaptchaService } from "../services/recaptcha.service";
import { AppError } from "../utils/AppError";

export class AuthController {
  static register = catchAsync(async (req: Request, res: Response) => {
    const { recaptchaToken, ...registerData } = req.body;
    
    if (!recaptchaToken) {
      throw new AppError("reCAPTCHA token is missing", 400);
    }
    const isHuman = await RecaptchaService.verify(recaptchaToken);
    if (!isHuman) {
      throw new AppError("reCAPTCHA verification failed. Please try again.", 400);
    }

    const user = await AuthService.register(registerData);
    return sendSuccess(res, { user }, "Account created successfully. Please verify your phone number.", 201);
  });

  static verifyOtp = catchAsync(async (req: Request, res: Response) => {
    const { userId, code } = req.body;
    const { accessToken, user } = await AuthService.verifyOtp(userId, code);

    const cookieOpts = {
      httpOnly: true as const,
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    res.cookie("accessToken", accessToken, cookieOpts);

    return sendSuccess(res, { user }, "Account verified and logged in");
  });

  static resendOtp = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.body;
    await AuthService.resendVerificationOtp(userId);
    return sendSuccess(res, null, "A new verification code has been sent");
  });

  static forgotPassword = catchAsync(async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;
    await AuthService.forgotPassword(phoneNumber);
    return sendSuccess(res, null, "If an account exists, a reset code has been sent");
  });

  static resetPassword = catchAsync(async (req: Request, res: Response) => {
    const { phoneNumber, otpCode, newPassword } = req.body;
    await AuthService.resetPassword(phoneNumber, otpCode, newPassword);
    return sendSuccess(res, null, "Password has been successfully reset");
  });

  static login = catchAsync(async (req: Request, res: Response) => {
    const { email, password, recaptchaToken } = req.body;
    
    if (!recaptchaToken) {
      throw new AppError("reCAPTCHA token is missing", 400);
    }
    const isHuman = await RecaptchaService.verify(recaptchaToken);
    if (!isHuman) {
      throw new AppError("reCAPTCHA verification failed. Please try again.", 400);
    }

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
