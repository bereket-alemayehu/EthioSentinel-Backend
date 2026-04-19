import nodemailer from "nodemailer";
import { env } from "../config/env.config";
import Logger from "./logger";

type AlertApprovalEmailPayload = {
  disease: string;
  location: string;
  advisory: string;
  severity: string; 
};

export class EmailSender {
  private static transporter: nodemailer.Transporter | null = null;

  private static isSmtpConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  }

  private static getTransporter(): nodemailer.Transporter | null {
    if (!this.isSmtpConfigured()) {
      return null;
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }

    return this.transporter;
  }

  static async sendEmail(
    to: string,
    subject: string,
    template: string,
    data: any,
  ) {
    const transporter = this.getTransporter();

    if (!transporter) {
      Logger.warn("SMTP not configured; skipping email delivery", {
        to,
        subject,
        template,
      });
      return { accepted: [] as string[], rejected: [to] };
    }

    const textBody = `Template: ${template}\n\n${JSON.stringify(data, null, 2)}`;

    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text: textBody,
    });

    return {
      accepted: info.accepted.map((value: unknown) => String(value)),
      rejected: info.rejected.map((value: unknown) => String(value)),
    };
  }

  static async sendBulkAlertApprovalEmails(
    recipients: string[],
    payload: AlertApprovalEmailPayload,
  ) {
    const uniqueRecipients = [
      ...new Set(recipients.map((value) => value.trim().toLowerCase())),
    ].filter((value) => value.length > 0);

    if (uniqueRecipients.length === 0) {
      return {
        attempted: 0,
        delivered: 0,
        failed: 0,
      };
    }

    const subject = `Health Alert Approved: ${payload.disease} (${payload.severity})`;
    const advisoryText =
      payload.advisory.length > 1200
        ? `${payload.advisory.slice(0, 1200)}...`
        : payload.advisory;

    const transporter = this.getTransporter();
    if (!transporter) {
      Logger.warn("SMTP not configured; bulk alert emails skipped", {
        recipients: uniqueRecipients.length,
      });
      return {
        attempted: uniqueRecipients.length,
        delivered: 0,
        failed: uniqueRecipients.length,
      };
    }

    const html = `
      <h2>Approved Health Alert</h2>
      <p><strong>Disease:</strong> ${payload.disease}</p>
      <p><strong>Location:</strong> ${payload.location}</p>
      <p><strong>Severity:</strong> ${payload.severity}</p>
      <p><strong>Advisory:</strong></p>
      <p>${advisoryText}</p>
    `;

    const text = [
      "Approved Health Alert",
      `Disease: ${payload.disease}`,
      `Location: ${payload.location}`,
      `Severity: ${payload.severity}`,
      `Advisory: ${advisoryText}`,
    ].join("\n");

    const results = await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        transporter.sendMail({
          from: env.SMTP_FROM,
          to: recipient,
          subject,
          text,
          html,
        }),
      ),
    );

    const delivered = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failed = results.length - delivered;

    return {
      attempted: uniqueRecipients.length,
      delivered,
      failed,
    };
  }

  static async sendOTP(to: string, otp: string) {
    return this.sendEmail(to, "Your OTP Code", "EmailOTP", { otp });
  }

  static async sendResetPassword(to: string, token: string) {
    return this.sendEmail(to, "Reset Your Password", "reset-password", {
      token,
    });
  }
}
