import axios from "axios";
import { AppError } from "../utils/AppError";
import { env } from "../config/env.config";

/** Sentinel value sent by the frontend when the device is offline. */
const OFFLINE_TOKEN = "OFFLINE";

export class RecaptchaService {
  static async verify(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    // ── Offline bypass ──────────────────────────────────────────────────────
    // When the client has no internet the reCAPTCHA widget cannot load.
    // The frontend detects this and sends a well-known sentinel value instead.
    // Security is maintained by the IP-based rate-limiter applied on the route
    // (loginRateLimiter / registerRateLimiter middlewares).
    if (token === OFFLINE_TOKEN) {
      console.info("[reCAPTCHA] Offline bypass used – skipping Google verification.");
      return true;
    }

    // ── Online verification ─────────────────────────────────────────────────
    const secretKey = env.SITESECRET;

    try {
      const response = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`,
        null,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const data = response.data;
      return data.success === true;
    } catch (error) {
      console.error("Error verifying reCAPTCHA:", error);
      return false;
    }
  }
}
