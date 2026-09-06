import redis from "@/lib/redis.js";
import { checkDatabaseHealth } from "@/lib/prisma.js";
import { mailTransporter } from "@/lib/mail.js";
import { getQueueMetrics } from "@/lib/queue.js";

export interface ComponentHealth {
    status: "healthy" | "unhealthy" | "degraded";
    latencyMs?: number | undefined;
    message?: string | undefined;
    details?: Record<string, unknown> | undefined;
}

export interface ReadinessReport {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    uptimeSeconds: number;
    components: {
        database: ComponentHealth;
        redis: ComponentHealth;
        mail: ComponentHealth;
    };
}

export interface WorkerHeartbeat {
    workerId: string;
    workerName: string;
    status: string;
    pid: number;
    queues: string[];
    concurrency: number;
    lastHeartbeatAt: string;
    uptimeSeconds: number;
}

export class HealthService {
    /**
     * Fast liveness probe for container orchestrator health checks.
     */
    getLiveness() {
        return {
            status: "healthy" as const,
            uptimeSeconds: Number(process.uptime().toFixed(1)),
            timestamp: new Date().toISOString(),
            pid: process.pid,
        };
    }

    /**
     * Deep readiness probe verifying database, redis, and mail services.
     */
    async getReadiness(): Promise<ReadinessReport> {
        const uptimeSeconds = Number(process.uptime().toFixed(1));

        // 1. Database Check
        const dbResult = await checkDatabaseHealth();
        const databaseHealth: ComponentHealth = {
            status: dbResult.healthy ? "healthy" : "unhealthy",
            latencyMs: dbResult.latencyMs,
            message: dbResult.error,
        };

        // 2. Redis Check
        let redisHealth: ComponentHealth;
        const redisStart = performance.now();
        try {
            if (redis.status === "ready" || redis.status === "connect") {
                const pong = await redis.ping();
                const latencyMs = Number((performance.now() - redisStart).toFixed(2));
                redisHealth = {
                    status: pong === "PONG" ? "healthy" : "unhealthy",
                    latencyMs,
                };
            } else {
                redisHealth = {
                    status: "degraded",
                    latencyMs: Number((performance.now() - redisStart).toFixed(2)),
                    message: `Redis status is currently "${redis.status}"`,
                };
            }
        } catch (err: any) {
            redisHealth = {
                status: "unhealthy",
                latencyMs: Number((performance.now() - redisStart).toFixed(2)),
                message: err.message || "Redis ping failed",
            };
        }

        // 3. Mail Transporter Check
        let mailHealth: ComponentHealth = { status: "healthy" };
        if (mailTransporter && typeof mailTransporter.verify === "function") {
            const mailStart = performance.now();
            try {
                await mailTransporter.verify();
                mailHealth = {
                    status: "healthy",
                    latencyMs: Number((performance.now() - mailStart).toFixed(2)),
                };
            } catch (err: any) {
                mailHealth = {
                    status: "degraded",
                    latencyMs: Number((performance.now() - mailStart).toFixed(2)),
                    message: err.message || "SMTP transporter verify failed",
                };
            }
        }

        // Overall status calculation: Database is critical, Redis & Mail are secondary
        let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
        if (databaseHealth.status === "unhealthy") {
            overallStatus = "unhealthy";
        } else if (redisHealth.status === "unhealthy" || redisHealth.status === "degraded") {
            overallStatus = "degraded";
        } else if (mailHealth.status === "unhealthy") {
            overallStatus = "degraded";
        }

        return {
            status: overallStatus,
            uptimeSeconds,
            timestamp: new Date().toISOString(),
            components: {
                database: databaseHealth,
                redis: redisHealth,
                mail: mailHealth,
            },
        };
    }

    /**
     * Inspects active worker heartbeats stored in Redis.
     */
    async getWorkerHealth() {
        const workers: WorkerHeartbeat[] = [];
        try {
            if (redis.status === "ready" || redis.status === "connect") {
                const keys = await redis.keys("worker:heartbeat:*");
                if (keys.length > 0) {
                    const values = await redis.mget(...keys);
                    for (const raw of values) {
                        if (raw) {
                            try {
                                workers.push(JSON.parse(raw) as WorkerHeartbeat);
                            } catch {}
                        }
                    }
                }
            }
        } catch (err: any) {
            console.warn("[HealthService] Failed to retrieve worker heartbeats:", err.message);
        }

        return {
            activeWorkersCount: workers.length,
            workers,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Retrieves BullMQ queue metrics across domains and DLQ.
     */
    async getQueueHealth() {
        return getQueueMetrics();
    }
}

export const healthService = new HealthService();
