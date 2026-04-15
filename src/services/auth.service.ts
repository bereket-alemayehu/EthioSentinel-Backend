import { prisma } from "../lib/prisma";
import { comparePassword } from "../utils/password.util";
import { signAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";

export class AuthService {
  static async login(identifier?: string, password?: string) {
    if (!identifier || !password) {
      throw new AppError("Username/email and password are required", 400);
    }

    const normalizedIdentifier = identifier.trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedIdentifier },
          { username: normalizedIdentifier },
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
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        region: user.regionName,
        assignedDistrict: user.assignedDistrict,
        clearanceLevel: user.clearanceLevel,
        regionId: user.regionId,
        districtId: user.districtId,
      },
    };
  }

  static async getMe(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        regionName: true,
        assignedDistrict: true,
        clearanceLevel: true,
        isActive: true,
        regionId: true,
        districtId: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return {
      ...user,
      region: user.regionName,
    };
  }
}
