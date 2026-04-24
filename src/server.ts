import http from "http";
import app from "./app";
import logger from "./utils/logger";
import { env } from "./config/env.config";


const server = http.createServer(app);


const startServer = async (): Promise<void> => {
  try {
   

    server.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

startServer().catch((err) => {
  logger.error("❌ Failed to start server:", err);
  process.exit(1);
});





