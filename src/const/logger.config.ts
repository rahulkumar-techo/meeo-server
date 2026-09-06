import { secureLogSerializers } from "@/common/security/masking.js";

export const preetyLogger = {
    logger: {
        level: process.env.LOG_LEVEL ?? "info",
        serializers: secureLogSerializers,
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
    },
};