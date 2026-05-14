import { prisma } from "../lib/prisma";
import { Role } from "@prisma/client";
import { comparePassword, hashPassword } from "../utils/password.util";
import { signAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";
import { haversineKm } from "../utils/geo.util";
import { SmsService } from "./sms.service";


export class AuthService {
  static async login(identifier?: string, password?: string) {
    if (!identifier || !password) {
      throw new AppError("Email/Phone and password are required", 400);
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phoneNumber: identifier },
        ],
      },
    });

    if (!user || !user.isActive) {
      throw new AppError("Invalid credentials", 401);
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError("Invalid credentials", 401);
    }

    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
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
  }) {
    const email = input.email ? String(input.email).trim().toLowerCase() : null;
    const phoneNumber = input.phoneNumber ? String(input.phoneNumber).trim() : null;
    const password = String(input.password ?? "");
    const username = String(input.username ?? "").trim();
    const region = input.region ? String(input.region).trim() : null;
    const assignedDistrict = input.assignedDistrict?.trim() || null;

    if ((!email && !phoneNumber) || !password || !username) {
      throw new AppError(
        "Email or Phone Number, password, and username are required",
        400,
      );
    }
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        throw new AppError("An account with this email already exists", 409);
      }
    }

    if (phoneNumber) {
      const existingPhone = await prisma.user.findUnique({ where: { phoneNumber } });
      if (existingPhone) {
        throw new AppError("An account with this phone number already exists", 409);
      }
    }

    const passwordHash = await hashPassword(password);

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const user = await prisma.user.create({
      data: {
        email,
        phoneNumber,
        username,
        passwordHash,
        role: Role.CITIZEN,
        region,
        assignedDistrict,
        isActive: false, // Inactive until OTP verified
        otpCode,
        otpExpiresAt,
      },
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        role: true,
        region: true,
        assignedDistrict: true,
      },
    });

    if (phoneNumber) {
      await SmsService.sendOtp(phoneNumber, otpCode).catch(err => {
        console.error("SMS failed but user created:", err);
      });
    }

    return user;
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

  static async resendVerificationOtp(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.isActive) {
      throw new AppError("Account is already verified", 400);
    }

    if (!user.phoneNumber) {
      throw new AppError("Cannot resend OTP: No phone number associated with account", 400);
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

    await SmsService.sendOtp(user.phoneNumber, otpCode).catch((err) => {
      console.error("SMS resend failed:", err);
    });

    return { success: true };
  }

  static async forgotPassword(phoneNumber: string) {
    const cleanPhone = String(phoneNumber).trim();
    const user = await prisma.user.findUnique({
      where: { phoneNumber: cleanPhone },
    });

    if (!user) {
      // Don't leak user existence, return success anyway
      return { success: true };
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode,
        otpExpiresAt,
      },
    });

    await SmsService.sendOtp(user.phoneNumber!, otpCode).catch((err) => {
      console.error("SMS forgot password failed:", err);
    });

    return { success: true };
  }

  static async resetPassword(phoneNumber: string, otpCode: string, newPassword: string) {
    const cleanPhone = String(phoneNumber).trim();
    const user = await prisma.user.findUnique({
      where: { phoneNumber: cleanPhone },
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
