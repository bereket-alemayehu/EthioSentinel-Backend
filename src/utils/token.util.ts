import jwt from "jsonwebtoken";
const { TokenExpiredError } = jwt;
import type { ITokenPayload,IToken } from "../interfaces/auth.interface";
import { AppError } from "./AppError";
import { env } from "../config/env.config";

// ─── Internal helpers ─────────────────────────────────────────────────────────

const getAccessSecret = (): string => {
  return env.JWT_ACCESS_SECRET || env.JWT_SECRET;
};


const getAccessExpiry = (): string =>
  env.JWT_ACCESS_EXPIRES_IN;



// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Signs and returns an access token.
 */
export const signAccessToken = (
  payload: Omit<ITokenPayload, "iat" | "exp">
): string => {
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: getAccessExpiry(),
  } as jwt.SignOptions);
};

/**
 * Verifies an access token and returns the decoded payload.
 * Converts jsonwebtoken errors into operational AppErrors with clear messages.
 */
export const verifyAccessToken = (token: string): ITokenPayload => {
  try {
    return jwt.verify(token, getAccessSecret()) as unknown as ITokenPayload;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      throw new AppError("Your session has expired. Please log in again.", 401);
    }
    throw new AppError("Invalid token. Please log in again.", 401);
  }
};



// Re-export for use in error-handling without re-importing jsonwebtoken
export type { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
