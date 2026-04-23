import winston from "winston";
import path from "path";

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

const isDev = process.env.NODE_ENV === "development";

// Development format: colorized, human-readable with stack traces
const devFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => {
      const msg = `${info.timestamp as string} ${info.level}: ${info.message as string}`;
      return info.stack ? `${msg}\n${info.stack as string}` : msg;
    },
  ),
);

// Production format: JSON with stack traces
const prodFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp(),
  winston.format.json(),
);

// Development transports: console only
const devTransports = [
  new winston.transports.Console({
    format: devFormat,
  }),
];

// Production transports: console + files
const prodTransports = [
  new winston.transports.Console({
    format: prodFormat,
  }),
  new winston.transports.File({
    filename: path.join("logs", "error.log"),
    level: "error",
    format: prodFormat,
  }),
  new winston.transports.File({
    filename: path.join("logs", "combined.log"),
    format: prodFormat,
  }),
];

const Logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  levels: logLevels,
  transports: isDev ? devTransports : prodTransports,
});

export default Logger;
