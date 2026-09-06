import { prisma } from "@/lib/prisma.js";

export interface BackoffOptions {
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
}

export const DEFAULT_BACKOFF_CONFIG: Required<BackoffOptions> = {
    baseDelayMs: 2000,      // 2 seconds
    maxDelayMs: 300000,     // 5 minutes
    jitterRatio: 0.2,       // +/- 20% randomization
};

export class OutboxRetryService {
    /**
     * Computes the exponential backoff delay in milliseconds based on the attempt count.
     * Formula: min(maxDelay, baseDelay * 2^(attempts - 1)) + jitter
     */
    computeExponentialBackoff(
        attempts: number,
        options: BackoffOptions = {},
    ): number {
        const config = { ...DEFAULT_BACKOFF_CONFIG, ...options };
        const safeAttempt = Math.max(1, attempts);
        
        // base exponential formula: baseDelay * 2^(attempts - 1)
        const exponentialDelay = config.baseDelayMs * Math.pow(2, safeAttempt - 1);
        const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
        
        // Add jitter to avoid thundering herd problem
        const jitterRange = cappedDelay * config.jitterRatio;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        
        return Math.max(config.baseDelayMs, Math.round(cappedDelay + jitter));
    }

    /**
     * Computes nextRetryAt Date object based on exponential backoff.
     */
    calculateNextRetryDate(attempts: number, options: BackoffOptions = {}): Date {
        const delayMs = this.computeExponentialBackoff(attempts, options);
        return new Date(Date.now() + delayMs);
    }

    /**
     * Unlocks orphaned/stale outbox events if a publisher crashed while processing.
     * Events locked longer than staleLockThresholdMs are reset back to PENDING.
     */
    async unlockStaleEvents(staleLockThresholdMs = 5 * 60 * 1000): Promise<number> {
        const staleThresholdDate = new Date(Date.now() - staleLockThresholdMs);

        const result = await prisma.outboxEvent.updateMany({
            where: {
                status: "PROCESSING",
                lockedAt: {
                    lte: staleThresholdDate,
                },
            },
            data: {
                status: "PENDING",
                lockedBy: null,
                lockedAt: null,
            },
        });

        if (result.count > 0) {
            console.log(`[OutboxRetryService] Unlocked ${result.count} stale outbox event(s).`);
        }

        return result.count;
    }
}

export const outboxRetryService = new OutboxRetryService();
