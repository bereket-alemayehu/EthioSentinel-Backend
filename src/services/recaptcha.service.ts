import axios from "axios";
import { AppError } from "../utils/AppError";

/** Sentinel value sent by the frontend when the device is offline. */
const OFFLINE_TOKEN = "OFFLINE";

/** Pairs with `RECAPTCHA_V2_TEST_SITEKEY` on the frontend; Google documents this for automated / local testing only. */
const GOOGLE_RECAPTCHA_V2_TEST_SECRET =
  "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

export class RecaptchaService {
  static async verify(token: string): Promise<boolean> {
    const configured = process.env.SITESECRET?.trim();
    const allowTest = process.env.RECAPTCHA_ALLOW_TEST === "true";
    const useTestSecret =
      process.env.NODE_ENV === "development" &&
      allowTest &&
      (!configured || configured === GOOGLE_RECAPTCHA_V2_TEST_SECRET);
    const secretKey = useTestSecret
      ? GOOGLE_RECAPTCHA_V2_TEST_SECRET
      : configured ||
        (process.env.NODE_ENV === "development" && allowTest
          ? GOOGLE_RECAPTCHA_V2_TEST_SECRET
          : "");

    if (!secretKey) {
      console.error(
        "reCAPTCHA SITESECRET is missing. Set SITESECRET (pair with VITE_RECAPTCHA_SITE_KEY) in .env.",
      );
      throw new AppError("reCAPTCHA configuration error on server", 500);
    }

    if (useTestSecret) {
      console.warn(
        "reCAPTCHA: using Google test secret (RECAPTCHA_ALLOW_TEST=true). Use real SITESECRET to remove the red testing banner.",
      );
    }

    if (!token) {
      return false;
    }

    // ── Offline bypass ──────────────────────────────────────────────────────
    // When the client has no internet the reCAPTCHA widget cannot load.
    // The frontend detects this and sends a well-known sentinel value instead.
    // Security is maintained by the IP-based rate-limiter applied on the route
    // (loginRateLimiter / registerRateLimiter middlewares).
    if (token === OFFLINE_TOKEN) {
      console.info(
        "[reCAPTCHA] Offline bypass used – skipping Google verification.",
      );
      return true;
    }

    // ── Online verification ─────────────────────────────────────────────────
    try {
      const response = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`,
        null,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const data = response.data;
      return data.success === true;
    } catch (error) {
      console.error("Error verifying reCAPTCHA:", error);
      return false;
    }
  }
}
