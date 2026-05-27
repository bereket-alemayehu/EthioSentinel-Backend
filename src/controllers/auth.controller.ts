import { Request, Response } from "express";
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

    const { user, otpDelivery, otpChannel } = await AuthService.register(registerData);
    const message = AuthService.buildOtpDeliveryMessage(otpDelivery, {
      email: user.email,
      phoneNumber: user.phoneNumber,
    });
    const devOtpCode =
      process.env.NODE_ENV !== "production" && otpDelivery.devConsoleOnly
        ? await AuthService.getDevOtpForUser(user.id)
        : undefined;
    return sendSuccess(
      res,
      { user, otpDelivery, otpChannel, ...(devOtpCode ? { devOtpCode } : {}) },
      message,
      201,
    );
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

    return sendSuccess(res, { user }, "Account verified successfully! Welcome to EthioSentinel.");
  });

  static resendOtp = catchAsync(async (req: Request, res: Response) => {
    const { userId, otpChannel } = req.body;
    const channel = otpChannel === "sms" ? "sms" : "email";
    const { otpDelivery, email, phoneNumber } =
      await AuthService.resendVerificationOtp(userId, channel);
    const message = AuthService.buildOtpDeliveryMessage(otpDelivery, {
      email,
      phoneNumber,
    });
    const devOtpCode =
      process.env.NODE_ENV !== "production" && otpDelivery.devConsoleOnly
        ? await AuthService.getDevOtpForUser(userId)
        : undefined;
    return sendSuccess(
      res,
      { otpDelivery, ...(devOtpCode ? { devOtpCode } : {}) },
      message,
    );
  });

  static forgotPassword = catchAsync(async (req: Request, res: Response) => {
    const { identifier, phoneNumber, otpChannel } = req.body;
    const id = String(identifier ?? phoneNumber ?? "").trim();
    if (!id) {
      throw new AppError("Email or phone number is required", 400);
    }
    const channel = otpChannel === "sms" ? "sms" : otpChannel === "email" ? "email" : undefined;
    const result = await AuthService.forgotPassword(id, channel);
    const message = AuthService.buildOtpDeliveryMessage(result.otpDelivery, {
      email: result.email ?? null,
      phoneNumber: result.phoneNumber ?? null,
    });
    return sendSuccess(
      res,
      {
        otpDelivery: result.otpDelivery,
        otpChannel: result.otpChannel,
        ...(result.devOtpCode ? { devOtpCode: result.devOtpCode } : {}),
      },
      result.otpDelivery.email || result.otpDelivery.sms
        ? message
        : "If an account exists, a recovery code has been sent.",
    );
  });

  static resetPassword = catchAsync(async (req: Request, res: Response) => {
    const { identifier, phoneNumber, otpCode, newPassword } = req.body;
    const id = String(identifier ?? phoneNumber ?? "").trim();
    if (!id) {
      throw new AppError("Email or phone number is required", 400);
    }
    await AuthService.resetPassword(id, otpCode, newPassword);
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

    const xf = req.headers["x-forwarded-for"];
    const ip =
      (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
      req.socket.remoteAddress ||
      null;
    const { accessToken, user } = await AuthService.login(email, password, {
      ipAddress: ip,
      userAgent: req.get("user-agent"),
    });

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

  static changePassword = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    const xf = req.headers["x-forwarded-for"];
    const ip =
      (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
      req.socket.remoteAddress ||
      null;
    await AuthService.changeOwnPassword(
      userId,
      String(currentPassword ?? ""),
      String(newPassword ?? ""),
      { ipAddress: ip, userAgent: req.get("user-agent") },
    );
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
    return sendSuccess(res, null, "Password updated. Please sign in again.");
  });

  static updateMeGeolocation = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const lat = Number((req.body as { latitude?: unknown }).latitude);
    const lng = Number((req.body as { longitude?: unknown }).longitude);
    const { user } = await AuthService.updateGeolocation(userId, lat, lng);
    return sendSuccess(res, { user }, "Location updated from device");
  });
}
