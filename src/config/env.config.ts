import dotenv from "dotenv";
import { cleanEnv, str, port, num, bool } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ["development", "test", "production"],
    default: "development",
  }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: str(),
  JWT_SECRET: str(),
  JWT_ACCESS_SECRET: str({ default: "" }), // Fallback logic will be in token.util or here
  JWT_ACCESS_EXPIRES_IN: str({ default: "15m" }),
  JWT_EXPIRES_IN: str({ default: "7d" }),
  SEED_ADMIN_PASSWORD: str({ default: "Admin@12345" }),
  SEED_SUPER_ADMIN_PASSWORD: str({ default: "SuperAdmin@12345" }),
  BODY_LIMIT: str({ default: "1mb" }),
  SMTP_HOST: str({ default: "" }),
  SMTP_PORT: num({ default: 587 }),
  SMTP_SECURE: bool({ default: false }),
  SMTP_USER: str({ default: "" }),
  SMTP_PASS: str({ default: "" }),
  SMTP_FROM: str({ default: "noreply@ethiosentinel.local" }),
  BREVO_API_KEY: str({ default: "" }),
  BREVO_SENDER_EMAIL: str({ default: "" }),
  EMAIL_FROM: str({ default: "" }),
  EMAIL_USER: str({ default: "" }),
  EMAIL_SENDER_NAME: str({ default: "EthioSentinel" }),
  ALERT_EMAIL_RECIPIENTS: str({ default: "" }),
  ALERT_RESEND_DUPLICATE_EMAILS: bool({ default: false }),
  FRONTEND_URL: str({ default: "http://localhost:5173" }),
  CLIENT_URL: str({ default: "" }),
  AI_SERVICE_BASE_URL: str({ default: "http://127.0.0.1:5000" }),
  AI_SERVICE_TIMEOUT_MS: num({ default: 5000 }),
  AI_SERVICE_RETRY_COUNT: num({ default: 3 }),
  AI_SERVICE_RETRY_DELAY_MS: num({ default: 1000 }),
  AI_SERVICE_ZSCORE_PATH: str({ default: "/detect" }),
  AI_WEBHOOK_TOKEN: str({ default: "" }),
  AI_INTERNAL_TOKEN: str({ default: "" }),
  GEMINI_API_KEY: str({ default: "" }),
  CHAT_BOT_NAME: str({ default: "EthioSentinel Assistant" }),
  TWILIO_ACCOUNT_SID: str({ default: "" }),
  TWILIO_AUTH_TOKEN: str({ default: "" }),
  TWILIO_MESSAGING_SERVICE_SID: str({ default: "" }),
  SITESECRET: str({ desc: "Google reCAPTCHA secret key" }),
});
