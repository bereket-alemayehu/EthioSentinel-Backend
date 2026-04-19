import { prisma } from "../lib/prisma";
import { comparePassword } from "../utils/password.util";
import { signAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";


export class AuthService {
  static async login(email?: string, password?: string) {
    if (!email || !password) {
      throw new AppError("Email and password are required", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
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
        email: user.email,
        role: user.role,
        region: user.region,
        assignedDistrict: user.assignedDistrict,
      },
    };
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
}
