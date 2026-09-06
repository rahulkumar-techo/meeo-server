import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { logger } from "@/common/observability/logger.js";
import { metricsService } from "@/common/observability/metrics.service.js";

const connectionString = `${process.env.DATABASE_URL}`;

const poolMax = parseInt(process.env.DB_POOL_MAX ?? "20", 10);
const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT ?? "30000", 10);
const poolConnectionTimeout = parseInt(process.env.DB_POOL_CONN_TIMEOUT ?? "5000", 10);
const SLOW_QUERY_THRESHOLD_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 200;

const adapter = new PrismaPg({
    connectionString,
    max: poolMax,
    idleTimeoutMillis: poolIdleTimeout,
    connectionTimeoutMillis: poolConnectionTimeout,
});

const basePrisma = new PrismaClient({ adapter });

/**
 * Prisma Client extended with query duration tracking and slow query warnings.
 */
const prisma = basePrisma.$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                const start = performance.now();
                try {
                    const result = await query(args);
                    const durationMs = Number((performance.now() - start).toFixed(2));
                    const isSlow = durationMs >= SLOW_QUERY_THRESHOLD_MS;

                    metricsService.recordDbQuery(durationMs, isSlow);

                    if (isSlow) {
                        logger.warn(
                            {
                                model,
                                operation,
                                durationMs,
                                thresholdMs: SLOW_QUERY_THRESHOLD_MS,
                            },
                            `[Prisma Slow Query] ${model}.${operation} took ${durationMs}ms`,
                        );
                    }

                    return result;
                } catch (error) {
                    const durationMs = Number((performance.now() - start).toFixed(2));
                    metricsService.recordDbQuery(durationMs, false);
                    throw error;
                }
            },
        },
    },
});

/**
 * Probes database connectivity and measures roundtrip latency.
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = performance.now();
    try {
        await (prisma as any).$queryRaw`SELECT 1`;
        const latencyMs = Number((performance.now() - start).toFixed(2));
        return { healthy: true, latencyMs };
    } catch (err: any) {
        const latencyMs = Number((performance.now() - start).toFixed(2));
        return { healthy: false, latencyMs, error: err.message || "Database connection probe failed" };
    }
}

export { prisma };