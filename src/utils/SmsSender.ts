import twilio from "twilio";
import Logger from "./logger";
import { env } from "../config/env.config";

export class SmsSender {
  private static client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  static async sendSms(to: string, body: string) {
    try {
      const message = await this.client.messages.create({
        body,
        from: process.env.TWILIO_MESSAGING_SERVICE_SID,
        to,
      });
      Logger.info("SMS sent successfully", { sid: message.sid, to });
      return { success: true, sid: message.sid };
    } catch (error) {
      Logger.error("Failed to send SMS", {
        error: error instanceof Error ? error.message : String(error),
        to,
      });
      return { success: false, error };
    }
  }

  static async sendBulkSms(phoneNumbers: string[], body: string) {
    const results = await Promise.all(
      phoneNumbers.map((phone) => this.sendSms(phone, body))
    );
    const delivered = results.filter((r) => r.success).length;
    const failed = results.length - delivered;
    return { delivered, failed };
  }
}
