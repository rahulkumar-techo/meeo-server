import pino from "pino";
import { secureLogSerializers } from "@/common/security/masking.js";
import { createLoggerTransport } from "@/const/logger.config.js";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");
const transport = createLoggerTransport();

/**
 * Production-ready structured logger instance.
 * Automatically ships logs to Grafana Cloud Loki when configured, while mirroring to console.
 */
export const logger = pino({
    level: logLevel,
    serializers: secureLogSerializers,
    base: {
        env: process.env.NODE_ENV ?? (isProduction ? "production" : "development"),
        service: "meeo-server",
    },
    ...(transport ? { transport } : {}),
});

/**
 * Creates a child logger with contextual bindings (e.g. requestId, userId, module).
 */
export function createChildLogger(bindings: Record<string, unknown>) {
    return logger.child(bindings);
}
