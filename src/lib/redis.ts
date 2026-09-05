import { Redis } from "ioredis";

// Pass your Redis URL (usually from environment variables)
// Defaulting to localhost:6379 for local development
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// 1. Triggered when a connection is established to the Redis server
redis.on("connect", () => {
    console.log("Successfully connected to Redis!");
});

// 2. Triggered when Redis is ready to receive commands
redis.on("ready", () => {
    console.log("Redis is ready.");
});

// 3. Catch and log connection errors (Crucial so your app doesn't crash)
redis.on("error", (err) => {
    console.error("Redis connection error:", err);
});

export default redis;