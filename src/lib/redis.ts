import { Redis, type RedisOptions } from "ioredis";

const redisOptions: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    connectTimeout: 10000,
    retryStrategy: (times) => {
        // Exponential backoff capped at 2000ms
        const delay = Math.min(times * 100, 2000);
        return delay;
    },
    reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
            // Reconnect if Redis is in read-only state during failover
            return true;
        }
        return false;
    },
};

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redis = new (Redis as unknown as { new (url: string, options?: RedisOptions): Redis })(redisUrl, redisOptions);

redis.on("connect", () => {
    console.log("[Redis] Connection established successfully.");
});

redis.on("ready", () => {
    console.log("[Redis] Client is ready to receive commands.");
});

redis.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message || err);
});

export default redis;