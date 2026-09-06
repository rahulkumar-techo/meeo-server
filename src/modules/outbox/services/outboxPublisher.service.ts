import os from "node:os";
import { prisma } from "@/lib/prisma.js";
import { publishDomainEventJob, publishDlqEventJob } from "@/lib/queue.js";
import { outboxRetryService } from "./outboxRetry.service.js";
import { AppError } from "@/common/errors/app-error.js";

export interface CreateOutboxEventInput {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    maxAttempts?: number;
}

export interface PublishBatchResult {
    claimedCount: number;
    publishedCount: number;
    failedCount: number;
    deadLetteredCount: number;
}

export class OutboxPublisherService {
    private publisherId: string;

    constructor() {
        this.publisherId = `publisher-${os.hostname()}-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
    }

    getPublisherId(): string {
        return this.publisherId;
    }

    /**
     * Transactional helper to persist an OutboxEvent inside any domain Prisma transaction.
     */
    async createOutboxEvent(
        tx: any,
        input: CreateOutboxEventInput,
    ) {
        return tx.outboxEvent.create({
            data: {
                eventType: input.eventType,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
                payload: input.payload,
                maxAttempts: input.maxAttempts ?? 10,
                status: "PENDING",
            },
        });
    }

    /**
     * Claims and locks a batch of eligible pending or retryable outbox events.
     */
    async claimBatchForPublishing(batchSize = 50): Promise<string[]> {
        const now = new Date();

        // 1. Recover stale locks first
        await outboxRetryService.unlockStaleEvents();

        // 2. Find candidate IDs eligible for publishing
        const candidates = await prisma.outboxEvent.findMany({
            where: {
                status: "PENDING",
                OR: [
                    { nextRetryAt: null },
                    { nextRetryAt: { lte: now } },
                ],
            },
            take: batchSize,
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });

        if (candidates.length === 0) {
            return [];
        }

        const candidateIds = candidates.map((c) => c.id);

        // 3. Atomically lock candidate events using optimistic/pessimistic update
        await prisma.outboxEvent.updateMany({
            where: {
                id: { in: candidateIds },
                status: "PENDING",
            },
            data: {
                status: "PROCESSING",
                lockedBy: this.publisherId,
                lockedAt: now,
            },
        });

        // 4. Return IDs successfully locked by this publisher instance
        const lockedEvents = await prisma.outboxEvent.findMany({
            where: {
                id: { in: candidateIds },
                lockedBy: this.publisherId,
            },
            select: { id: true },
        });

        return lockedEvents.map((e) => e.id);
    }

    /**
     * Polls the outbox table, claims a batch with lock, and publishes them to BullMQ.
     */
    async pollAndPublishBatch(batchSize = 50): Promise<PublishBatchResult> {
        const lockedIds = await this.claimBatchForPublishing(batchSize);

        const result: PublishBatchResult = {
            claimedCount: lockedIds.length,
            publishedCount: 0,
            failedCount: 0,
            deadLetteredCount: 0,
        };

        if (lockedIds.length === 0) {
            return result;
        }

        const events = await prisma.outboxEvent.findMany({
            where: { id: { in: lockedIds } },
        });

        for (const event of events) {
            try {
                // 1. Publish job to BullMQ queue with deduplication key (jobId = event.id)
                await publishDomainEventJob(
                    event.eventType,
                    {
                        id: event.id,
                        eventType: event.eventType,
                        aggregateType: event.aggregateType,
                        aggregateId: event.aggregateId,
                        payload: event.payload,
                        createdAt: event.createdAt,
                    },
                    event.id,
                );

                // 2. Mark event as PUBLISHED
                await prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: "PUBLISHED",
                        publishedAt: new Date(),
                        lockedBy: null,
                        lockedAt: null,
                        lastError: null,
                    },
                });

                result.publishedCount++;
            } catch (err: any) {
                const errorMessage = err?.message || "Failed to publish event to queue";
                const nextAttempt = event.attempts + 1;
                const isMaxAttemptsExhausted = nextAttempt >= event.maxAttempts;

                if (isMaxAttemptsExhausted) {
                    // Transition to terminal FAILED state & forward to Dead Letter Queue (DLQ)
                    await prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            status: "FAILED",
                            attempts: nextAttempt,
                            lastError: `[Max Attempts Reached] ${errorMessage}`,
                            lockedBy: null,
                            lockedAt: null,
                        },
                    });

                    await publishDlqEventJob(
                        `dlq-${event.eventType}`,
                        {
                            id: event.id,
                            eventType: event.eventType,
                            aggregateType: event.aggregateType,
                            aggregateId: event.aggregateId,
                            payload: event.payload,
                            attempts: nextAttempt,
                        },
                        errorMessage,
                    ).catch((dlqErr) => {
                        console.error(`[OutboxPublisher] Failed to push event ${event.id} to DLQ:`, dlqErr);
                    });

                    result.deadLetteredCount++;
                } else {
                    // Schedule next retry with exponential backoff
                    const nextRetryAt = outboxRetryService.calculateNextRetryDate(nextAttempt);

                    await prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            status: "PENDING",
                            attempts: nextAttempt,
                            nextRetryAt,
                            lastError: errorMessage,
                            lockedBy: null,
                            lockedAt: null,
                        },
                    });

                    result.failedCount++;
                }
            }
        }

        return result;
    }

    /**
     * Manually triggers a retry for a FAILED or dead-lettered outbox event.
     */
    async retryFailedEvent(eventId: string) {
        const event = await prisma.outboxEvent.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            throw new AppError("Outbox event not found", 404);
        }

        if (event.status === "PUBLISHED") {
            throw new AppError("Outbox event is already PUBLISHED", 400);
        }

        return prisma.outboxEvent.update({
            where: { id: eventId },
            data: {
                status: "PENDING",
                attempts: 0,
                nextRetryAt: null,
                lastError: null,
                lockedBy: null,
                lockedAt: null,
            },
        });
    }
}

export const outboxPublisherService = new OutboxPublisherService();
