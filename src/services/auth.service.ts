import { prisma } from "../lib/prisma";
import { Role } from "@prisma/client";
import { comparePassword, hashPassword } from "../utils/password.util";
import { signAccessToken } from "../utils/token.util";
import { AppError } from "../utils/AppError";
import { haversineKm } from "../utils/geo.util";


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

  static async register(input: {
    email?: string;
    password?: string;
    username?: string;
    region?: string;
    assignedDistrict?: string | null;
  }) {
    const email = String(input.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(input.password ?? "");
    const username = String(input.username ?? "").trim();
    const region = String(input.region ?? "").trim();
    const assignedDistrict = input.assignedDistrict?.trim() || null;

    if (!email || !password || !username || !region) {
      throw new AppError(
        "email, password, username, and region are required",
        400,
      );
    }
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError("An account with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role: Role.CITIZEN,
        region,
        assignedDistrict,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        region: true,
        assignedDistrict: true,
      },
    });

    return user;
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
