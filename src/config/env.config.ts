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
});
