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
  BODY_LIMIT: str({ default: "1mb" }),
  SMTP_HOST: str({ default: "" }),
  SMTP_PORT: num({ default: 587 }),
  SMTP_SECURE: bool({ default: false }),
  SMTP_USER: str({ default: "" }),
  SMTP_PASS: str({ default: "" }),
  SMTP_FROM: str({ default: "noreply@ethiosentinel.local" }),
  AI_SERVICE_BASE_URL: str({ default: "http://127.0.0.1:5000" }),
  AI_SERVICE_TIMEOUT_MS: num({ default: 5000 }),
  AI_SERVICE_RETRY_COUNT: num({ default: 3 }),
  AI_SERVICE_RETRY_DELAY_MS: num({ default: 1000 }),
  AI_SERVICE_ZSCORE_PATH: str({ default: "/anomaly/zscore" }),
  AI_WEBHOOK_TOKEN: str({ default: "" }),
  AI_INTERNAL_TOKEN: str({ default: "" }),
  AI_CHAT_PROVIDER: str({ default: "HUGGINGFACE" }),
  AI_CHAT_MODEL: str({ default: "HuggingFaceH4/zephyr-7b-beta" }),
  AI_CHAT_BASE_URL: str({ default: "https://api-inference.huggingface.co/models" }),
  AI_CHAT_API_KEY: str({ default: "" }),
  GEMINI_API_KEY: str({ default: "" }),
});
