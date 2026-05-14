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

  static async sendSms(to: string, body: string) {
    const client = this.getClient();
    if (!client) {
      Logger.warn("Twilio not configured; skipping SMS delivery", { to, body });
      return null;
    }

    try {
      const sid = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
      if (!sid) {
        Logger.warn("TWILIO_MESSAGING_SERVICE_SID not set; skipping SMS delivery", {
          to,
        });
        return null;
      }
      // Messaging Service SIDs start with MG and must use messagingServiceSid, not `from`.
      const message = await client.messages.create(
        sid.startsWith("MG")
          ? { body, to, messagingServiceSid: sid }
          : { body, to, from: sid },
      );
      Logger.info("SMS sent successfully", { sid: message.sid, to });
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
