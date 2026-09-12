import { secureLogSerializers } from "@/common/security/masking.js";

const isProduction = process.env.NODE_ENV === "production";

/** ANSI Escape color codes for colorized terminal log formatting */
const METHOD_COLORS: Record<string, string> = {
    GET: "\x1b[1;36m",      // Bold Cyan
    POST: "\x1b[1;32m",     // Bold Green
    PUT: "\x1b[1;33m",      // Bold Yellow
    PATCH: "\x1b[1;35m",    // Bold Magenta
    DELETE: "\x1b[1;31m",   // Bold Red
    OPTIONS: "\x1b[1;90m",  // Bold Gray
    HEAD: "\x1b[1;34m",     // Bold Blue
};

/**
 * Formats a clean, high-visibility HTTP request line with colorized method, status code, and latency.
 */
export function formatHttpLog(
    method: string,
    url: string,
    statusCode: number,
    durationMs: number,
    reqId?: string,
): string {
    const reset = "\x1b[0m";
    const methodColor = METHOD_COLORS[method.toUpperCase()] || "\x1b[1;37m";
    const methodFormatted = `${methodColor}${method.toUpperCase().padEnd(7, " ")}${reset}`;

    let statusColor = "\x1b[1;32m"; // Green
    if (statusCode >= 500) statusColor = "\x1b[1;31m"; // Red
    else if (statusCode >= 400) statusColor = "\x1b[1;33m"; // Yellow
    else if (statusCode >= 300) statusColor = "\x1b[1;36m"; // Cyan
    const statusFormatted = `${statusColor}${statusCode}${reset}`;

    let durationColor = "\x1b[90m"; // Dim Gray
    if (durationMs > 500) durationColor = "\x1b[1;31m"; // Red
    else if (durationMs > 100) durationColor = "\x1b[1;33m"; // Yellow
    const durationFormatted = `${durationColor}${durationMs.toFixed(2)}ms${reset}`;

    const idFormatted = reqId ? `\x1b[90m[${reqId}]\x1b[0m` : "";

    return `${methodFormatted} ${url} ${statusFormatted} ${durationFormatted} ${idFormatted}`.trim();
}

export const preetyLogger = {
    disableRequestLogging: true,
    logger: {
        level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
        serializers: secureLogSerializers,
        ...(isProduction
            ? {}
            : {
                  transport: {
                      target: "pino-pretty",
                      options: {
                          colorize: true,
                          levelFirst: true,
                          translateTime: "SYS:HH:MM:ss.l",
                          singleLine: true,
                          ignore: "pid,hostname,reqId,req,res,responseTime",
                      },
                  },
              }),
    },
};