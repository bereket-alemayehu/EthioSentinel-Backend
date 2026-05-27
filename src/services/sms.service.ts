import twilio from "twilio";
import { env } from "../config/env.config";
import Logger from "../utils/logger";

export class SmsService {
  private static client: twilio.Twilio | null = null;

  private static getClient() {
    if (!this.client && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
    return this.client;
  }

  private static formatPhoneNumber(phone: string): string {
    let clean = phone.trim().replace(/\s+/g, "");

    // If it's a standard Ethiopian local number (09... or 07...)
    if (clean.startsWith("0") && clean.length === 10) {
      return "+251" + clean.slice(1);
    }
    
    // If it's a 9-digit number starting with 9 or 7 (missing the leading 0)
    if (clean.length === 9 && (clean.startsWith("9") || clean.startsWith("7"))) {
      return "+251" + clean;
    }

    // If it already starts with 251 but missing the +
    if (clean.startsWith("251") && clean.length === 12) {
      return "+" + clean;
    }

    // Otherwise, ensure it has a + (Twilio requirement for E.164)
    return clean.startsWith("+") ? clean : "+" + clean;
  }

  static async sendSms(to: string, body: string) {
    const formattedTo = this.formatPhoneNumber(to);
    const client = this.getClient();
    if (!client) {
      if (env.NODE_ENV !== "production" && body.includes("verification code")) {
        const match = body.match(/(\d{6})/);
        Logger.warn(
          `[DEV] SMS OTP for ${formattedTo}: ${match?.[1] ?? "(see body)"}`,
        );
      } else {
        Logger.warn("Twilio not configured; skipping SMS delivery", {
          to: formattedTo,
          body,
        });
      }
      return null;
    }

    try {
      const sid = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
      if (!sid) {
        if (env.NODE_ENV !== "production" && body.includes("verification code")) {
          const match = body.match(/(\d{6})/);
          Logger.warn(
            `[DEV] SMS OTP for ${formattedTo}: ${match?.[1] ?? "(see body)"}`,
          );
        } else {
          Logger.warn("TWILIO_MESSAGING_SERVICE_SID not set; skipping SMS delivery", {
            to: formattedTo,
          });
        }
        return null;
      }
      // Messaging Service SIDs start with MG and must use messagingServiceSid, not `from`.
      const message = await client.messages.create(
        sid.startsWith("MG")
          ? { body, to: formattedTo, messagingServiceSid: sid }
          : { body, to: formattedTo, from: sid },
      );
      Logger.info("SMS sent successfully", { sid: message.sid, to: formattedTo });
      return message;
    } catch (error) {
      Logger.error("Failed to send SMS via Twilio", { error, to });
      throw error;
    }
  }

  static async sendOtp(to: string, otp: string) {
    const body = `Your EthioSentinel verification code is: ${otp}. It will expire in 10 minutes.`;
    return this.sendSms(to, body);
  }
}
