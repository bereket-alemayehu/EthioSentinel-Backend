import type { Application, Request, Response, NextFunction } from "express";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";

// Centralizes req.id and req.user type augmentations
import { errorHandler as globalErrorHandler } from "./middlewares/errorHandler";
import { apiLimiter } from "./middlewares/rateLimiter";
import { logger } from "./utils/logger";
import router from "./routes/index";
import { env } from "./config/env.config";

const app: Application = express();

// ----------------------------------------------------------------------------
// 1. Request ID Middleware
// ----------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = uuidv4();
  res.setHeader("X-Request-Id", req.id);
  next();
});

// ----------------------------------------------------------------------------
// 2. Security Middleware
// ----------------------------------------------------------------------------
app.use(helmet());
app.use(hpp());
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.set("trust proxy", 1);


// ----------------------------------------------------------------------------
// 3. Cookie Parser (required for cookie-based JWT fallback)
// ----------------------------------------------------------------------------
app.use(cookieParser());

// ----------------------------------------------------------------------------
// 4. Rate Limiting
// ----------------------------------------------------------------------------
app.use("/api", apiLimiter);

// ----------------------------------------------------------------------------
// 5. Body Parsers
// ----------------------------------------------------------------------------
app.use(express.json({ limit: env.BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));

// ----------------------------------------------------------------------------
// 6. Compression
// ----------------------------------------------------------------------------
app.use(compression());

// ----------------------------------------------------------------------------
// 7. HTTP Request Logging
// ----------------------------------------------------------------------------
if (env.NODE_ENV !== "production") {
  app.use(morgan("dev", { stream: { write: (message) => logger.http(message.trim()) } }));
} else {
  app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));
}

// ----------------------------------------------------------------------------
// 8. Health Check
// ----------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// ----------------------------------------------------------------------------
// 9. API Routes
// ----------------------------------------------------------------------------

app.use("/api",router);

// ----------------------------------------------------------------------------
// 10. 404 Handler
// ----------------------------------------------------------------------------
app.use((req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`, {
    requestId: req.id,
  });

  res.status(404).json({
    success: false,
    message: `Cannot find ${req.method} ${req.originalUrl}`,
  });
});

// ----------------------------------------------------------------------------
// 11. Global Error Handler (must be last)
// ----------------------------------------------------------------------------
app.use(globalErrorHandler);

export default app;
