import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { UserRole } from "../../generated/prisma/enums";
import { env } from "../config/env";

type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(payload: {
  id: number;
  email: string;
  role: UserRole;
}): string {
  return jwt.sign(
    {
      sub: String(payload.id),
      email: payload.email,
      role: payload.role,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] },
  );
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
