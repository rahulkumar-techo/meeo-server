import pino from "pino";
import { secureLogSerializers } from "@/common/security/masking.js";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

/**
 * Production-ready structured logger instance.
 * In development, uses pino-pretty for human readability; in production, emits structured JSON.
 */
export const logger = pino({
    level: logLevel,
    serializers: secureLogSerializers,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
        env: process.env.NODE_ENV ?? "development",
        service: "meeo-server",
    },
    ...(isProduction
        ? {}
        : {
              transport: {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      levelFirst: true,
                      translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
                      singleLine: true,
                      ignore: "pid,hostname",
                  },
              },
          }),
});

/**
 * Creates a child logger with contextual bindings (e.g. requestId, userId, module).
 */
export function createChildLogger(bindings: Record<string, unknown>) {
    return logger.child(bindings);
}
