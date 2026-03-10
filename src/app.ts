import cors from "cors";
import express from "express";
import morgan from "morgan";
import { apiRouter } from "./routes";

export const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "EthioHealthSentinel API",
    version: "1.0.0",
    docs: "/api/health",
  });
});

app.use("/api", apiRouter);
