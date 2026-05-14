import rateLimit from "express-rate-limit";

/**
 * Rate limiter applied to auth endpoints (login & register).
 *
 * This is the PRIMARY security control when reCAPTCHA is bypassed in
 * offline mode (token === "OFFLINE"). It limits each IP to 10 attempts
 * per 15-minute window, preventing brute-force password attacks.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 requests per window per IP
  standardHeaders: true,     // Return rate-limit info in `RateLimit-*` headers
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many login attempts from this IP. Please wait 15 minutes and try again.",
  },
  skipSuccessfulRequests: false, // count successful logins too (prevents enumeration)
});

/**
 * Slightly stricter limiter for registration to prevent account-creation spam.
 */
export const registerRateLimiter = rateLimit({
  windowMs: 600 * 60 * 1000, // 1 hour
  max: 80,                    // max 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many accounts created from this IP. Please try again in an hour.",
  },
});
