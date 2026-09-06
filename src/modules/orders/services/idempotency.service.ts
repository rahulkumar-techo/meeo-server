import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";

const IDEMPOTENCY_TTL_HOURS = 24;

export class IdempotencyService {
    /**
     * Checks if an idempotency key was already completed, or locks it in PROCESSING state.
     */
    async resolveOrLockKey(key?: string, userId?: string, requestHash?: string) {
        if (!key) {
            return { isCached: false };
        }

        const existing = await prisma.idempotencyKey.findUnique({
            where: { key },
        });

        if (existing) {
            if (existing.status === "COMPLETED" && existing.responseBody) {
                return {
                    isCached: true,
                    responseStatus: existing.responseStatus ?? 200,
                    responseBody: existing.responseBody,
                };
            }

            if (existing.status === "PROCESSING") {
                // If key is stale (older than 2 minutes in PROCESSING), allow override/retry
                const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                if (existing.createdAt < twoMinutesAgo) {
                    await prisma.idempotencyKey.delete({ where: { key } });
                } else {
                    throw new AppError(
                        "A checkout request with this Idempotency-Key is currently in progress. Please wait.",
                        409,
                    );
                }
            }
        }

        const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);

        try {
            await prisma.idempotencyKey.create({
                data: {
                    key,
                    ...(userId ? { userId } : {}),
                    ...(requestHash ? { requestHash } : {}),
                    status: "PROCESSING",
                    expiresAt,
                },
            });
        } catch {
            // Concurrent race condition
            throw new AppError(
                "A checkout request with this Idempotency-Key is currently in progress. Please wait.",
                409,
            );
        }

        return { isCached: false };
    }

    /**
     * Marks an idempotency key as COMPLETED and stores response payload.
     */
    async finalizeKey(key: string, responseStatus: number, responseBody: any) {
        try {
            await prisma.idempotencyKey.update({
                where: { key },
                data: {
                    status: "COMPLETED",
                    responseStatus,
                    responseBody,
                },
            });
        } catch {
            // Ignore if key was removed
        }
    }

    /**
     * Cleans up or marks an idempotency key as FAILED upon unhandled error.
     */
    async releaseKey(key?: string) {
        if (!key) return;
        try {
            await prisma.idempotencyKey.delete({
                where: { key },
            });
        } catch {
            // Ignore
        }
    }
}

export const idempotencyService = new IdempotencyService();
