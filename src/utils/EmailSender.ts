import { BrevoClient, type Brevo } from "@getbrevo/brevo";
import nodemailer from "nodemailer";
import { env } from "../config/env.config";
import {
  generateOTPEmailHTML,
  getOTPEmailSubject,
} from "../templates/EmailOTP";
import {
  generateResetPasswordEmailHTML,
  getResetPasswordEmailSubject,
} from "../templates/reset-password";
import Logger from "./logger";

type AlertApprovalEmailPayload = {
  disease: string;
  location: string;
  advisory: string;
  severity: string;
  alertTitle?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function severityBadgeColor(severity: string): { bg: string; text: string; border: string } {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") return { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" };
  if (s === "HIGH") return { bg: "#fff7ed", text: "#9a3412", border: "#fed7aa" };
  if (s === "MEDIUM") return { bg: "#fffbeb", text: "#92400e", border: "#fde68a" };
  return { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" };
}

type SpikeAlertEmailPayload = {
  disease: string;
  location: string;
  currentCases: number;
  expectedCases: number;
  currentDeaths?: number;
  mortalityRate?: number;
  zScore?: number;
  severity: string;
  summary: string;
  /** AI-generated advisory draft text (included in admin spike emails). */
  aiAdvisoryDraft?: string;
};

export class EmailSender {
  subject: string;
  htmlContent: string;
  sender: { email: string; name?: string };
  to: { email: string; name?: string }[];
  client: BrevoClient;

  constructor({
    subject,
    htmlContent,
    sender,
    to,
  }: {
    subject: string;
    htmlContent: string;
    sender: { email: string; name?: string };
    to: { email: string; name?: string }[];
  }) {
    this.subject = subject;
    this.htmlContent = htmlContent;
    this.sender = sender;
    this.to = to;
    this.client = new BrevoClient({ apiKey: env.BREVO_API_KEY });
  }

  private static getSender() {
    const email = env.EMAIL_FROM || env.BREVO_SENDER_EMAIL || env.EMAIL_USER || env.SMTP_FROM;
    return {
      email,
      name: env.EMAIL_SENDER_NAME || "EthioSentinel",
    };
  }

  private static isBrevoConfigured(): boolean {
    const sender = this.getSender();
    return Boolean(env.BREVO_API_KEY && sender.email);
  }

  private static stripEnvQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, "").trim();
  }

  /** `xsmtpsib-…` = SMTP relay only; `xkeysib-…` = REST API. */
  private static usesBrevoSmtpKey(): boolean {
    return env.BREVO_API_KEY.trim().startsWith("xsmtpsib-");
  }

  private static getBrevoSmtpLogin(): string {
    const login =
      env.BREVO_SMTP_LOGIN ||
      env.SMTP_USER ||
      env.EMAIL_USER ||
      this.getSender().email;
    return this.stripEnvQuotes(login);
  }

  private static logBrevoFailureHint(error: unknown) {
    const errText = error instanceof Error ? error.message : String(error);
    if (errText.includes("Key not found")) {
      Logger.error(
        "Brevo rejected the API key. Use an xkeysib- REST key from Brevo → SMTP & API → API Keys, " +
          "or keep your xsmtpsib- SMTP key and set BREVO_SMTP_LOGIN from the SMTP tab.",
      );
      return;
    }
    if (errText.includes("unrecognised IP") || errText.includes("Unauthorized IP")) {
      Logger.error(
        "Brevo blocked this server IP. Add your IP under Brevo → Security → Authorized IPs, or disable IP restriction.",
      );
      return;
    }
    if (errText.includes("Brevo SMTP")) {
      Logger.error(errText);
    }
  }

  private static async sendViaBrevoSmtp(input: {
    subject: string;
    htmlContent: string;
    sender: { email: string; name?: string };
    to: { email: string; name?: string }[];
  }) {
    const pass = env.BREVO_API_KEY.trim();
    const user = this.getBrevoSmtpLogin();
    if (!user || !pass) {
      throw new Error(
        "Brevo SMTP: set BREVO_SMTP_LOGIN (login from Brevo → SMTP & API → SMTP) and xsmtpsib key as BREVO_API_KEY",
      );
    }

    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST || "smtp-relay.brevo.com",
      port: env.SMTP_PORT || 587,
      secure: env.SMTP_SECURE,
      auth: { user, pass },
    });

    try {
      const from = input.sender.name
        ? `"${input.sender.name}" <${input.sender.email}>`
        : input.sender.email;
      await transport.sendMail({
        from,
        to: input.to.map((r) =>
          r.name ? `"${r.name}" <${r.email}>` : r.email,
        ),
        subject: input.subject,
        html: input.htmlContent,
      });
    } finally {
      transport.close();
    }
  }

  async send() {
    if (EmailSender.usesBrevoSmtpKey()) {
      return EmailSender.sendViaBrevoSmtp({
        subject: this.subject,
        htmlContent: this.htmlContent,
        sender: this.sender,
        to: this.to,
      });
    }

    const payload: Brevo.SendTransacEmailRequest = {
      subject: this.subject,
      htmlContent: this.htmlContent,
      sender: {
        email: this.sender.email,
        name: this.sender.name,
      },
      to: this.to.map((recipient) => ({
        email: recipient.email,
        name: recipient.name,
      })),
    };

    return this.client.transactionalEmails.sendTransacEmail(payload);
  }

  private static logDevelopmentFallback(input: {
    title: string;
    to: string | string[];
    subject: string;
    html: string;
  }) {
    if (env.NODE_ENV === "production") return;
    Logger.warn(`${input.title} email fallback`, {
      to: input.to,
      subject: input.subject,
      preview: input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
    });
  }

  private static wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static describeEmailError(error: any) {
    return {
      error: error instanceof Error ? error.message : String(error),
      cause:
        error?.cause instanceof Error
          ? error.cause.message
          : error?.cause
            ? String(error.cause)
            : undefined,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      body: error?.response?.data ?? error?.body,
      code: error?.code,
    };
  }

  static async sendEmail(
    to: string,
    subject: string,
    template: string,
    data: any,
  ) {
    const sender = this.getSender();
    if (!this.isBrevoConfigured()) {
      Logger.warn("Brevo not configured; skipping email delivery", {
        to,
        subject,
        template,
      });
      this.logDevelopmentFallback({
        title: template,
        to,
        subject,
        html: JSON.stringify(data, null, 2),
      });
      return { accepted: [] as string[], rejected: [to] };
    }

    const htmlContent = `Template: ${template}<pre>${JSON.stringify(data, null, 2)}</pre>`;
    const emailSender = new EmailSender({
      subject,
      htmlContent,
      sender,
      to: [{ email: to }],
    });
    await emailSender.send();

    return {
      accepted: [to],
      rejected: [] as string[],
    };
  }

  private static async sendBulkHtmlEmail(input: {
    recipients: string[];
    subject: string;
    html: string;
    fallbackTitle: string;
  }) {
    const uniqueRecipients = [
      ...new Set(input.recipients.map((value) => value.trim().toLowerCase())),
    ].filter((value) => value.length > 0);

    if (uniqueRecipients.length === 0) {
      return {
        attempted: 0,
        delivered: 0,
        failed: 0,
      };
    }

    const sender = this.getSender();
    if (!this.isBrevoConfigured()) {
      Logger.warn("Brevo not configured; bulk emails skipped", {
        recipients: uniqueRecipients.length,
        subject: input.subject,
      });
      this.logDevelopmentFallback({
        title: input.fallbackTitle,
        to: uniqueRecipients,
        subject: input.subject,
        html: input.html,
      });
      return {
        attempted: uniqueRecipients.length,
        delivered: 0,
        failed: uniqueRecipients.length,
      };
    }

    const sendToRecipients = async (recipients: string[]) => {
      const emailSender = new EmailSender({
        subject: input.subject,
        htmlContent: input.html,
        sender,
        to: recipients.map((email) => ({ email })),
      });
      await emailSender.send();
    };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await sendToRecipients(uniqueRecipients);
        return {
          attempted: uniqueRecipients.length,
          delivered: uniqueRecipients.length,
          failed: 0,
        };
      } catch (error: any) {
        Logger.error("Brevo bulk email attempt failed", {
          subject: input.subject,
          attempt,
          recipients: uniqueRecipients.length,
          ...this.describeEmailError(error),
        });
        if (attempt < 3) {
          await this.wait(1000 * attempt);
        }
      }
    }

    let delivered = 0;
    let failed = 0;
    for (const recipient of uniqueRecipients) {
      try {
        await sendToRecipients([recipient]);
        delivered += 1;
      } catch (error: any) {
        failed += 1;
        Logger.error("Brevo single-recipient email failed", {
          subject: input.subject,
          recipient,
          ...this.describeEmailError(error),
        });
      }
    }

    if (delivered > 0) {
      return {
        attempted: uniqueRecipients.length,
        delivered,
        failed,
      };
    }

    return {
      attempted: uniqueRecipients.length,
      delivered: 0,
      failed: uniqueRecipients.length,
    };
  }

  static parseConfiguredAlertRecipients(): string[] {
    return env.ALERT_EMAIL_RECIPIENTS.split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  }

  static async sendOTPEmail(
    email: string,
    otp: string,
    fullName?: string,
  ): Promise<boolean> {
    const subject = getOTPEmailSubject();
    const html = generateOTPEmailHTML({ otp, fullName });
    const sender = this.getSender();

    if (!this.isBrevoConfigured()) {
      Logger.warn("Brevo not configured; OTP email not sent", { email });
      if (env.NODE_ENV !== "production") {
        Logger.warn(`[DEV] OTP for ${email}: ${otp} (configure BREVO_API_KEY + EMAIL_FROM)`);
      }
      this.logDevelopmentFallback({
        title: "OTP",
        to: email,
        subject,
        html,
      });
      return false;
    }

    try {
      const emailSender = new EmailSender({
        subject,
        htmlContent: html,
        sender,
        to: [{ email, name: fullName }],
      });
      await emailSender.send();
      Logger.info("OTP email sent successfully", { email });
      return true;
    } catch (error: any) {
      const errText = error instanceof Error ? error.message : String(error);
      Logger.error("Error sending OTP email via Brevo", {
        email,
        error: errText,
        status: error?.response?.status,
        brevoMode: this.usesBrevoSmtpKey() ? "smtp" : "rest",
      });
      this.logBrevoFailureHint(error);
      if (env.NODE_ENV !== "production") {
        Logger.warn(`[DEV] OTP for ${email}: ${otp} (Brevo send failed — use this code locally)`);
        this.logDevelopmentFallback({ title: "OTP", to: email, subject, html });
      }
      return false;
    }
  }

  static async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    fullName?: string,
  ): Promise<boolean> {
    const frontendUrl = env.FRONTEND_URL || env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    const subject = getResetPasswordEmailSubject();
    const html = generateResetPasswordEmailHTML({
      resetUrl,
      fullName,
      validityMinutes: 10,
    });
    const sender = this.getSender();

    if (!this.isBrevoConfigured()) {
      Logger.warn("Brevo not configured; reset email skipped", { email });
      this.logDevelopmentFallback({
        title: "Password reset",
        to: email,
        subject,
        html,
      });
      return env.NODE_ENV !== "production";
    }

    try {
      const emailSender = new EmailSender({
        subject,
        htmlContent: html,
        sender,
        to: [{ email, name: fullName }],
      });
      await emailSender.send();
      Logger.info("Password reset email sent successfully", { email });
      return true;
    } catch (error: any) {
      Logger.error("Error sending password reset email via Brevo", {
        email,
        error: error instanceof Error ? error.message : String(error),
        status: error?.response?.status,
      });
      if (env.NODE_ENV !== "production") {
        this.logDevelopmentFallback({ title: "Password reset", to: email, subject, html });
        return true;
      }
      return false;
    }
  }

  static async sendBulkAlertApprovalEmails(
    recipients: string[],
    payload: AlertApprovalEmailPayload,
  ) {
    const subject = `EthioSentinel — ${payload.disease} health alert (${payload.location})`;
    const advisoryText =
      payload.advisory.length > 2000
        ? `${payload.advisory.slice(0, 2000)}…`
        : payload.advisory;
    const badge = severityBadgeColor(payload.severity);
    const title = escapeHtml(payload.alertTitle ?? `Health alert: ${payload.disease}`);
    const advisoryHtml = escapeHtml(advisoryText).replace(/\n/g, "<br/>");

    const html = `
      <div style="margin:0;padding:0;background:#f0f7f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
          <div style="background:linear-gradient(135deg,#0f6b7c 0%,#0d9488 100%);border-radius:20px 20px 0 0;padding:28px 24px;color:#ffffff;">
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.9;font-weight:700;">EthioSentinel</p>
            <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;">Approved public health alert</h1>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.5;opacity:0.95;">This message is now live for citizens in the target area.</p>
          </div>
          <div style="background:#ffffff;border:1px solid #d1e7e4;border-top:0;border-radius:0 0 20px 20px;padding:24px;box-shadow:0 12px 40px rgba(15,107,124,0.08);">
            <p style="margin:0 0 16px;font-size:18px;font-weight:800;color:#0f172a;line-height:1.35;">${title}</p>
            <div style="display:inline-block;background:${badge.bg};color:${badge.text};border:1px solid ${badge.border};border-radius:999px;padding:8px 14px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:20px;">
              Severity: ${escapeHtml(payload.severity)}
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
              <tr>
                <td style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px 0 0 12px;width:38%;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;">Disease</td>
                <td style="padding:12px 14px;background:#ffffff;border:1px solid #e2e8f0;border-left:0;border-radius:0 12px 12px 0;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(payload.disease)}</td>
              </tr>
              <tr><td colspan="2" style="height:8px;"></td></tr>
              <tr>
                <td style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px 0 0 12px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;">Location</td>
                <td style="padding:12px 14px;background:#ffffff;border:1px solid #e2e8f0;border-left:0;border-radius:0 12px 12px 0;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(payload.location)}</td>
              </tr>
            </table>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:16px;padding:18px 20px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:800;color:#047857;text-transform:uppercase;letter-spacing:1px;">Public guidance</p>
              <p style="margin:0;font-size:15px;line-height:1.75;color:#134e4a;">${advisoryHtml}</p>
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#64748b;line-height:1.6;">Citizens in this zone will also see this in the app notification bell. SMS alerts are sent where phone numbers are registered.</p>
          </div>
        </div>
      </div>
    `;

    return this.sendBulkHtmlEmail({
      recipients,
      subject,
      html,
      fallbackTitle: "Approved health alert",
    });
  }

  static async sendBulkSpikeAlertEmails(
    recipients: string[],
    payload: SpikeAlertEmailPayload,
  ) {
    const zScore =
      typeof payload.zScore === "number" ? payload.zScore.toFixed(2) : "N/A";
    const mortalityRate =
      typeof payload.mortalityRate === "number"
        ? `${(payload.mortalityRate * 100).toFixed(1)}%`
        : "N/A";
    const currentDeaths = payload.currentDeaths ?? 0;
    const subject = `EthioSentinel Critical Health Alert: ${payload.disease} in ${payload.location}`;
    const advisoryBlock = payload.aiAdvisoryDraft
      ? `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:16px;margin:20px 0;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#92400e;">AI advisory draft</p>
              <p style="margin:0;font-size:14px;line-height:1.7;color:#78350f;white-space:pre-wrap;">${payload.aiAdvisoryDraft.length > 2000 ? `${payload.aiAdvisoryDraft.slice(0, 2000)}…` : payload.aiAdvisoryDraft}</p>
            </div>`
      : "";
    const html = `
      <div style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
          <div style="background:#0f6b7c;border-radius:22px 22px 0 0;padding:24px;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ccecf0;font-weight:700;">
              EthioSentinel Disease Surveillance
            </p>
            <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;">
              Critical Public Health Alert
            </h1>
            <p style="margin:10px 0 0;font-size:15px;color:#e8fbfd;">
              Unusual disease activity requires admin review and field follow-up.
            </p>
          </div>

          <div style="background:#ffffff;border:1px solid #dbe7e5;border-top:0;border-radius:0 0 22px 22px;padding:24px;">
            <div style="display:inline-block;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
              Severity: ${payload.severity}
            </div>

            <h2 style="margin:18px 0 8px;font-size:20px;line-height:1.3;color:#0f172a;">
              ${payload.disease} signal detected in ${payload.location}
            </h2>

            <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#475569;">
              ${payload.summary}
            </p>
            ${advisoryBlock}

            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px;">
                <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Current cases</p>
                <p style="margin:6px 0 0;font-size:28px;font-weight:800;color:#0f172a;">${payload.currentCases}</p>
              </div>
              <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:14px;">
                <p style="margin:0;font-size:11px;color:#9f1239;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Current deaths</p>
                <p style="margin:6px 0 0;font-size:28px;font-weight:800;color:#9f1239;">${currentDeaths}</p>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px;">
                <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Mortality rate</p>
                <p style="margin:6px 0 0;font-size:24px;font-weight:800;color:#0f172a;">${mortalityRate}</p>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px;">
                <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:1px;">Expected recent level</p>
                <p style="margin:6px 0 0;font-size:24px;font-weight:800;color:#0f172a;">${payload.expectedCases.toFixed(1)}</p>
              </div>
            </div>

            <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:16px;padding:16px;margin-top:18px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#155e75;">Recommended admin actions</p>
              <ol style="margin:0;padding-left:20px;color:#164e63;font-size:14px;line-height:1.7;">
                <li>Review the anomaly details in the EthioSentinel admin dashboard.</li>
                <li>Verify the latest HEW reports and mortality figures for the affected district.</li>
                <li>Coordinate field follow-up and decide whether a public advisory is required.</li>
              </ol>
            </div>

            <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
              Technical reference: z-score ${zScore}. This notification was generated automatically by EthioSentinel and should be reviewed by an authorized health administrator.
            </p>
          </div>
        </div>
      </div>
    `;

    return this.sendBulkHtmlEmail({
      recipients,
      subject,
      html,
      fallbackTitle: "Disease spike alert",
    });
  }

  static async sendOTP(to: string, otp: string) {
    return this.sendOTPEmail(to, otp);
  }

  static async sendResetPassword(to: string, token: string) {
    return this.sendPasswordResetEmail(to, token);
  }
}
