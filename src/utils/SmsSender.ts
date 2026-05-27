import twilio from "twilio";
import Logger from "./logger";
import { env } from "../config/env.config";

export class SmsSender {
  private static client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

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
    try {
      const formattedTo = this.formatPhoneNumber(to);
      const sid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
      if (!sid) {
        Logger.error("TWILIO_MESSAGING_SERVICE_SID is not set");
        return { success: false, error: new Error("Missing TWILIO_MESSAGING_SERVICE_SID") };
      }
      const message = await this.client.messages.create(
        sid.startsWith("MG")
          ? { body, to: formattedTo, messagingServiceSid: sid }
          : { body, to: formattedTo, from: sid },
      );
      Logger.info("SMS sent successfully", { sid: message.sid, to: formattedTo });
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
