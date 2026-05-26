import { prisma } from "../lib/prisma";
import { Role } from "@prisma/client";
import { comparePassword, hashPassword } from "../utils/password.util";
import { signAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";
import { haversineKm } from "../utils/geo.util";
import { SmsService } from "./sms.service";
import { EmailSender } from "../utils/EmailSender";
import { AuditService } from "./audit.service";
import { env } from "../config/env.config";
import Logger from "../utils/logger";

export type OtpChannel = "email" | "sms";

export type OtpDeliveryResult = {
  email: boolean;
  sms: boolean;
  /** True when dev mode logged the OTP to the terminal because Brevo/Twilio did not send. */
  devConsoleOnly?: boolean;
};

export type LoginAuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class AuthService {
  /** Send OTP via the channel the user chose (email or SMS, not both). */
  private static async deliverVerificationOtp(
    contact: { email: string | null; phoneNumber: string | null },
    otpCode: string,
    channel: OtpChannel,
  ): Promise<OtpDeliveryResult> {
    const result: OtpDeliveryResult = { email: false, sms: false };

    if (channel === "email") {
      if (!contact.email) {
        throw new AppError("Email is required to send a verification code by email", 400);
      }
      try {
        result.email = await EmailSender.sendOTP(contact.email, otpCode);
        if (!result.email && env.NODE_ENV !== "production") {
          result.devConsoleOnly = true;
        }
      } catch (err) {
        Logger.error("OTP email delivery failed", {
          email: contact.email,
          error: err instanceof Error ? err.message : String(err),
        });
        if (env.NODE_ENV !== "production") {
          result.devConsoleOnly = true;
        }
      }
    } else {
      if (!contact.phoneNumber) {
        throw new AppError(
          "Phone number is required to send a verification code by SMS",
          400,
        );
      }
      try {
        const sms = await SmsService.sendOtp(contact.phoneNumber, otpCode);
        result.sms = sms != null;
        if (!result.sms && env.NODE_ENV !== "production") {
          result.devConsoleOnly = true;
        }
      } catch (err) {
        Logger.error("OTP SMS delivery failed", {
          phone: contact.phoneNumber,
          error: err instanceof Error ? err.message : String(err),
        });
        if (env.NODE_ENV !== "production") {
          result.devConsoleOnly = true;
        }
      }
    }

    if (result.devConsoleOnly && env.NODE_ENV !== "production") {
      Logger.warn(
        `[DEV] Verification OTP (${channel}) — copy this code: ${otpCode}`,
        {
          email: contact.email ?? undefined,
          phone: contact.phoneNumber ?? undefined,
          hint: "Not in inbox until Brevo/Twilio is fixed (see Brevo Security → Authorized IPs if email fails with 401).",
        },
      );
    }

    return result;
  }

  static buildOtpDeliveryMessage(
    delivery: OtpDeliveryResult,
    contact: { email: string | null; phoneNumber: string | null },
  ): string {
    if (delivery.email && delivery.sms) {
      return "A 6-digit verification code was sent to your email and phone.";
    }
    if (delivery.email) {
      return "A 6-digit verification code was sent to your email.";
    }
    if (delivery.sms) {
      return "A 6-digit verification code was sent to your phone via SMS.";
    }
    if (delivery.devConsoleOnly && env.NODE_ENV !== "production") {
      if (contact.email) {
        return (
          "Email was not delivered. Check Brevo: use an xkeysib- API key, or xsmtpsib- SMTP key with BREVO_SMTP_LOGIN. " +
          "Use the dev code below if you are testing locally."
        );
      }
      return (
        "SMS was not delivered. Use the dev code shown below or in the backend terminal ([DEV] Verification OTP)."
      );
    }
    if (env.NODE_ENV !== "production") {
      return "Could not deliver the code. Check the backend terminal for [DEV] Verification OTP.";
    }
    if (contact.email) {
      return "We could not send the verification email. Check spam, Brevo sender settings, or try SMS.";
    }
    return "We could not send the verification SMS. Try resend or contact support.";
  }

  static async login(
    identifier?: string,
    password?: string,
    auditCtx?: LoginAuditContext,
  ) {
    if (!identifier || !password) {
      throw new AppError("Email/Phone and password are required", 400);
    }

    const idKey = String(identifier).trim();
    const emailLookup = idKey.includes("@") ? idKey.toLowerCase() : idKey;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailLookup }, { phoneNumber: idKey }],
      },
      select: {
        id: true,
        email: true,
        username: true,
        passwordHash: true,
        phoneNumber: true,
        role: true,
        region: true,
        assignedDistrict: true,
        healthFacilityId: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      await AuditService.append({
        action: "AUTH_LOGIN_FAILURE",
        actorEmail: idKey.includes("@") ? emailLookup : undefined,
        metadata: {
          reason: "unknown_or_inactive_account",
          summary: `Failed login for ${idKey} (no active account)`,
        },
        ipAddress: auditCtx?.ipAddress,
        userAgent: auditCtx?.userAgent,
      });
      throw new AppError("Invalid credentials", 401);
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      await AuditService.append({
        action: "AUTH_LOGIN_FAILURE",
        actorUserId: user.id,
        actorEmail: user.email,
        resourceType: "User",
        resourceId: user.id,
        metadata: {
          reason: "invalid_password",
          summary: `Failed login for ${user.email ?? user.phoneNumber ?? idKey} (${user.username}) — wrong password`,
          username: user.username,
          role: user.role,
        },
        ipAddress: auditCtx?.ipAddress,
        userAgent: auditCtx?.userAgent,
      });
      throw new AppError("Invalid credentials", 401);
    }

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    await AuditService.append({
      action: "AUTH_LOGIN_SUCCESS",
      actorUserId: user.id,
      actorEmail: user.email,
      resourceType: "User",
      resourceId: user.id,
      metadata: {
        summary: `${user.username} (${user.role}) signed in successfully`,
        username: user.username,
        role: user.role,
        region: user.region,
      },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        region: user.region,
        assignedDistrict: user.assignedDistrict,
        healthFacilityId: user.healthFacilityId,
      },
    };
  }

  static async register(input: {
    email?: string;
    phoneNumber?: string;
    password?: string;
    username?: string;
    region?: string;
    assignedDistrict?: string | null;
    otpChannel?: OtpChannel;
  }) {
    const email = input.email ? String(input.email).trim().toLowerCase() : null;
    const phoneNumber = input.phoneNumber ? String(input.phoneNumber).trim() : null;
    const password = String(input.password ?? "");
    const username = String(input.username ?? "").trim();
    const region = input.region ? String(input.region).trim() : null;
    const assignedDistrict = input.assignedDistrict?.trim() || null;
    const otpChannel: OtpChannel =
      input.otpChannel === "sms" ? "sms" : "email";

    if (!password || !username) {
      throw new AppError("Password and username are required", 400);
    }
    if (otpChannel === "email" && !email) {
      throw new AppError("Email is required when sending the code by email", 400);
    }
    if (otpChannel === "sms" && !phoneNumber) {
      throw new AppError(
        "Phone number is required when sending the code by SMS",
        400,
      );
    }
    if (!email && !phoneNumber) {
      throw new AppError(
        "Provide at least an email or phone number for your account",
        400,
      );
    }
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    // ── 1. Check for existing user ──────────────────────────────────────────
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
    });

    const passwordHash = await hashPassword(password);
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    let user;

    if (existingUser) {
      // ── 2. If user exists and is already verified, reject ────────────────
      if (existingUser.isActive) {
        let field = "identifier";
        if (email && existingUser.email === email) field = "email";
        else if (phoneNumber && existingUser.phoneNumber === phoneNumber) field = "phone number";
        
        throw new AppError(`An account with this ${field} already exists and is already verified.`, 409);
      }

      // ── 3. If user exists but NOT verified, update and resend OTP ─────────
      // This allows users to "retry" registration or update details if they didn't verify.
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username,
          passwordHash,
          region,
          assignedDistrict,
          otpCode,
          otpExpiresAt,
          otpPreferredChannel: otpChannel,
          email,        // Update email/phone in case they changed one of them in the retry
          phoneNumber,
        },
        select: {
          id: true,
          username: true,
          email: true,
          phoneNumber: true,
          role: true,
          region: true,
          assignedDistrict: true,
          healthFacilityId: true,
        },
      });
      console.info(`[Auth] Existing unverified user ${user.id} updated for re-verification.`);
    } else {
      // ── 4. Create new user ────────────────────────────────────────────────
      user = await prisma.user.create({
        data: {
          email,
          phoneNumber,
          username,
          passwordHash,
          role: Role.CITIZEN,
          region,
          assignedDistrict,
          isActive: false,
          otpCode,
          otpExpiresAt,
          otpPreferredChannel: otpChannel,
        },
        select: {
          id: true,
          username: true,
          email: true,
          phoneNumber: true,
          role: true,
          region: true,
          assignedDistrict: true,
          healthFacilityId: true,
        },
      });
    }

    const otpDelivery = await this.deliverVerificationOtp(
      { email: user.email, phoneNumber: user.phoneNumber },
      otpCode,
      otpChannel,
    );

    return { user, otpDelivery, otpChannel };
  }

  static async verifyOtp(userId: string, otpCode: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.isActive) {
      throw new AppError("Account already verified", 400);
    }

    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new AppError("Invalid verification code", 400);
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      throw new AppError("Verification code expired", 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        otpCode: null,
        otpExpiresAt: null,
      },
    });

    const accessToken = signAccessToken({
      id: updatedUser.id,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      role: updatedUser.role,
      tokenVersion: updatedUser.tokenVersion,
    });

    return {
      accessToken,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        role: updatedUser.role,
        region: updatedUser.region,
        assignedDistrict: updatedUser.assignedDistrict,
      },
    };
  }

  static async resendVerificationOtp(userId: string, otpChannel: OtpChannel) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.isActive) {
      throw new AppError("Account is already verified", 400);
    }

    if (!user.phoneNumber && !user.email) {
      throw new AppError("Cannot resend OTP: No contact method (email or phone) associated with account", 400);
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await prisma.user.update({
      where: { id: userId },
      data: {
        otpCode,
        otpExpiresAt,
      },
    });

    const otpDelivery = await this.deliverVerificationOtp(
      { email: user.email, phoneNumber: user.phoneNumber },
      otpCode,
      otpChannel,
    );

    return {
      success: true,
      otpDelivery,
      otpChannel,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };
  }

  private static resolveOtpChannelForUser(
    user: { email: string | null; phoneNumber: string | null; otpPreferredChannel: string | null },
    requested?: OtpChannel,
  ): OtpChannel {
    if (requested === "email" || requested === "sms") {
      return requested;
    }
    const stored = user.otpPreferredChannel?.trim().toLowerCase();
    if (stored === "email" || stored === "sms") {
      return stored;
    }
    if (user.email) return "email";
    if (user.phoneNumber) return "sms";
    return "email";
  }

  static async forgotPassword(identifier: string, otpChannel?: OtpChannel) {
    const cleanId = String(identifier).trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: cleanId },
          { email: cleanId.toLowerCase() },
        ],
      },
    });

    if (!user) {
      return {
        success: true,
        otpDelivery: { email: false, sms: false } as OtpDeliveryResult,
        otpChannel: "email" as OtpChannel,
        email: null,
        phoneNumber: null,
      };
    }

    const channel = this.resolveOtpChannelForUser(user, otpChannel);
    if (channel === "email" && !user.email) {
      throw new AppError("This account has no email on file. Use SMS or contact support.", 400);
    }
    if (channel === "sms" && !user.phoneNumber) {
      throw new AppError("This account has no phone on file. Use email or contact support.", 400);
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode,
        otpExpiresAt,
        otpPreferredChannel: channel,
      },
    });

    const otpDelivery = await this.deliverVerificationOtp(
      { email: user.email, phoneNumber: user.phoneNumber },
      otpCode,
      channel,
    );

    return {
      success: true,
      otpDelivery,
      otpChannel: channel,
      email: user.email,
      phoneNumber: user.phoneNumber,
      devOtpCode:
        env.NODE_ENV !== "production" && otpDelivery.devConsoleOnly
          ? otpCode
          : undefined,
    };
  }

  static async getDevOtpForUser(userId: string): Promise<string | undefined> {
    if (env.NODE_ENV === "production") return undefined;
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { otpCode: true },
    });
    return row?.otpCode ?? undefined;
  }

  static async resetPassword(
    identifier: string,
    otpCode: string,
    newPassword: string,
  ) {
    const cleanId = String(identifier).trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: cleanId },
          { email: cleanId.toLowerCase() },
        ],
      },
    });

    if (!user) {
      throw new AppError("Invalid reset attempt", 400);
    }

    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new AppError("Invalid verification code", 400);
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      throw new AppError("Verification code expired", 400);
    }

    if (newPassword.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        otpCode: null,
        otpExpiresAt: null,
        isActive: true, 
      },
    });

    return { success: true };
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        region: true,
        assignedDistrict: true,
        clearanceLevel: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  static async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    auditCtx?: LoginAuditContext,
  ) {
    if (!currentPassword || !newPassword) {
      throw new AppError("Current and new password are required", 400);
    }
    if (newPassword.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const ok = await comparePassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw new AppError("Current password is incorrect", 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });

    await AuditService.append({
      action: "PASSWORD_CHANGED_SELF",
      actorUserId: userId,
      actorEmail: user.email,
      resourceType: "User",
      resourceId: userId,
      metadata: {
        summary: "User changed their own password; all sessions were invalidated",
      },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  /** Sets `assignedDistrict` to the nearest district with coordinates and syncs `region` to that district's region. */
  static async updateGeolocation(
    userId: string,
    latitude: number,
    longitude: number,
  ) {
    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new AppError("Invalid coordinates", 400);
    }

    const districts = await prisma.district.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        name: true,
        latitude: true,
        longitude: true,
        region: { select: { name: true } },
      },
    });

    if (districts.length === 0) {
      throw new AppError("No districts with coordinates are configured", 503);
    }

    let nearest = districts[0];
    let bestKm = Infinity;
    for (const d of districts) {
      const lat = Number(d.latitude);
      const lon = Number(d.longitude);
      const km = haversineKm(latitude, longitude, lat, lon);
      if (km < bestKm) {
        bestKm = km;
        nearest = d;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        assignedDistrict: nearest.name,
        region: nearest.region.name,
      },
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        region: true,
        assignedDistrict: true,
        clearanceLevel: true,
        createdAt: true,
      },
    });

    return { user: updated, matchedDistanceKm: bestKm };
  }
}
