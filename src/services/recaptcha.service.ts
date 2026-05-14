import axios from "axios";
import { AppError } from "../utils/AppError";

/** Pairs with `RECAPTCHA_V2_TEST_SITEKEY` on the frontend; Google documents this for automated / local testing only. */
const GOOGLE_RECAPTCHA_V2_TEST_SECRET =
  "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

export class RecaptchaService {
  static async verify(token: string): Promise<boolean> {
    const configured = process.env.SITESECRET?.trim();
    const secretKey =
      configured ||
      (process.env.NODE_ENV === "development" ? GOOGLE_RECAPTCHA_V2_TEST_SECRET : "");

    if (!secretKey) {
      console.error("reCAPTCHA SITESECRET is missing from environment variables.");
      throw new AppError("reCAPTCHA configuration error on server", 500);
    }

    if (!configured && process.env.NODE_ENV === "development") {
      console.warn(
        "reCAPTCHA: SITESECRET unset — using Google's v2 test secret in development only. Set SITESECRET for production-like behavior.",
      );
    }

    if (!token) {
      return false;
    }

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
