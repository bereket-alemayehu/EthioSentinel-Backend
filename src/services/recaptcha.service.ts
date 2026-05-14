import axios from "axios";
import { AppError } from "../utils/AppError";

export class RecaptchaService {
  static async verify(token: string): Promise<boolean> {
    const secretKey = process.env.SITESECRET;

    if (!secretKey) {
      console.error("reCAPTCHA SITESECRET is missing from environment variables.");
      // Fail open or fail closed? Usually fail closed.
      throw new AppError("reCAPTCHA configuration error on server", 500);
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
