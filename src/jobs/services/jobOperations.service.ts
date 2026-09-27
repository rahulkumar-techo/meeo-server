import { prisma } from "@/lib/prisma.js";
import { domainEventQueue, deadLetterQueue, publishDomainEventJob } from "@/lib/queue.js";
import { AppError } from "@/common/errors/app-error.js";
import type { BulkJobActionInput } from "../validations/job.validation.js";

export class JobOperationsService {
    /**
     * Inspects full job details, payload, error stack trace, and execution history.
     */
    async getJobDetails(id: string) {
        const event = await prisma.outboxEvent.findUnique({
            where: { id },
        });

        if (!event) {
            throw new AppError("Job not found", 404);
        }

        // Also query processed events log if any
        const consumerLogs = await prisma.processedEvent.findMany({
            where: { eventId: id },
            orderBy: { processedAt: "desc" },
        });

        return {
            jobId: event.id,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            status: event.status,
            payload: event.payload,
            attempts: event.attempts,
            maxAttempts: event.maxAttempts,
            lastError: event.lastError,
            lockedBy: event.lockedBy,
            lockedAt: event.lockedAt ? event.lockedAt.toISOString() : null,
            nextRetryAt: event.nextRetryAt ? event.nextRetryAt.toISOString() : null,
            createdAt: event.createdAt.toISOString(),
            publishedAt: event.publishedAt ? event.publishedAt.toISOString() : null,
            consumerLogs: consumerLogs.map((c) => ({
                id: c.id,
                consumerName: c.consumerName,
                status: c.status,
                lastError: c.lastError,
                processedAt: c.processedAt ? c.processedAt.toISOString() : null,
            })),
        };
    }

    /**
     * Retries a specific failed or dead-lettered job.
     */
    async retryJob(id: string) {
        const event = await prisma.outboxEvent.findUnique({
            where: { id },
        });

        if (!event) {
            throw new AppError("Job not found", 404);
        }

        if (event.status === "PUBLISHED") {
            throw new AppError("Job has already completed successfully and cannot be retried", 400);
        }

        // Reset status to PENDING and clear retry locks
        const updated = await prisma.outboxEvent.update({
            where: { id },
            data: {
                status: "PENDING",
                attempts: 0,
                lockedBy: null,
                lockedAt: null,
                nextRetryAt: null,
                lastError: null,
            },
        });

        // Immediately attempt enqueueing into BullMQ
        await publishDomainEventJob(
            event.eventType,
            event.payload as Record<string, unknown>,
            event.id,
        );

        return {
            jobId: updated.id,
            status: "WAITING",
            message: "Job reset and enqueued for immediate execution",
            retriedAt: new Date().toISOString(),
        };
    }

    /**
     * Cancels / discards an active or waiting job.
     */
    async cancelJob(id: string) {
        const event = await prisma.outboxEvent.findUnique({
            where: { id },
        });

        if (!event) {
            throw new AppError("Job not found", 404);
        }

        if (event.status === "PUBLISHED") {
            throw new AppError("Cannot cancel completed job", 400);
        }

        const updated = await prisma.outboxEvent.update({
            where: { id },
            data: {
                status: "FAILED",
                lastError: "Job cancelled by operator",
                lockedBy: null,
                lockedAt: null,
            },
        });

        return {
            jobId: updated.id,
            status: "CANCELLED",
            message: "Job cancelled successfully",
        };
    }

    /**
     * Executes bulk actions across queues (e.g. retry all failed, purge dead letters).
     */
    async executeBulkAction(input: BulkJobActionInput) {
        switch (input.action) {
            case "RETRY_ALL_FAILED": {
                const failedEvents = await prisma.outboxEvent.findMany({
                    where: { status: "FAILED" },
                    take: 100,
                });

                if (failedEvents.length === 0) {
                    return { action: input.action, affectedCount: 0, message: "No failed jobs to retry" };
                }

                const ids = failedEvents.map((e) => e.id);
                await prisma.outboxEvent.updateMany({
                    where: { id: { in: ids } },
                    data: {
                        status: "PENDING",
                        attempts: 0,
                        lockedBy: null,
                        lockedAt: null,
                        nextRetryAt: null,
                        lastError: null,
                    },
                });

                for (const event of failedEvents) {
                    await publishDomainEventJob(
                        event.eventType,
                        event.payload as Record<string, unknown>,
                        event.id,
                    ).catch(() => {});
                }

                return {
                    action: input.action,
                    affectedCount: ids.length,
                    message: `Successfully re-queued ${ids.length} failed jobs`,
                };
            }

            case "PURGE_DEAD_LETTER": {
                await deadLetterQueue.obliterate({ force: true }).catch(() => {});
                return {
                    action: input.action,
                    message: "Dead Letter Queue purged successfully",
                };
            }

            case "PAUSE_QUEUES": {
                await Promise.allSettled([
                    domainEventQueue.pause(),
                    deadLetterQueue.pause(),
                ]);
                return {
                    action: input.action,
                    message: "All worker queues paused",
                };
            }

            case "RESUME_QUEUES": {
                await Promise.allSettled([
                    domainEventQueue.resume(),
                    deadLetterQueue.resume(),
                ]);
                return {
                    action: input.action,
                    message: "All worker queues resumed",
                };
            }
        }
    }
}

export const jobOperationsService = new JobOperationsService();
