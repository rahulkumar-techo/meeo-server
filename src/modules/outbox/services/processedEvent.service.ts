import { prisma } from "@/lib/prisma.js";

export interface ConsumerExecutionResult<T> {
    success: boolean;
    alreadyProcessed: boolean;
    data?: T;
    error?: string;
}

export class ProcessedEventService {
    /**
     * Executes a consumer handler function with strict idempotency guarantees.
     * Prevents duplicate execution of event side-effects across distributed workers.
     */
    async runWithConsumerIdempotency<T>(
        consumerName: string,
        eventId: string,
        handler: () => Promise<T>,
    ): Promise<ConsumerExecutionResult<T>> {
        // 1. Check existing consumer record
        const existing = await prisma.processedEvent.findUnique({
            where: {
                eventId_consumerName: {
                    eventId,
                    consumerName,
                },
            },
        });

        // If this consumer has already successfully processed this event, skip immediately
        if (existing?.status === "COMPLETED") {
            return {
                success: true,
                alreadyProcessed: true,
            };
        }

        // 2. Mark event as PROCESSING for this consumer
        const record = await prisma.processedEvent.upsert({
            where: {
                eventId_consumerName: {
                    eventId,
                    consumerName,
                },
            },
            update: {
                status: "PROCESSING",
                attempts: { increment: 1 },
                lastError: null,
            },
            create: {
                eventId,
                consumerName,
                status: "PROCESSING",
                attempts: 1,
            },
        });

        // 3. Execute business logic handler
        try {
            const data = await handler();

            // 4. Mark status as COMPLETED upon success
            await prisma.processedEvent.update({
                where: { id: record.id },
                data: {
                    status: "COMPLETED",
                    processedAt: new Date(),
                    lastError: null,
                },
            });

            return {
                success: true,
                alreadyProcessed: false,
                data,
            };
        } catch (err: any) {
            const errorMessage = err?.message || "Consumer execution failed";

            // Record failure in audit log
            await prisma.processedEvent.update({
                where: { id: record.id },
                data: {
                    status: "FAILED",
                    lastError: errorMessage,
                },
            }).catch((updateErr) => {
                console.error(`[ProcessedEventService] Failed to record error state for ${record.id}:`, updateErr);
            });

            throw err;
        }
    }

    /**
     * Retrieves processed event history with pagination.
     */
    async listProcessedEvents(query: {
        consumerName?: string | undefined;
        eventId?: string | undefined;
        status?: "PROCESSING" | "COMPLETED" | "FAILED" | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    } = {}) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.consumerName) where.consumerName = query.consumerName;
        if (query.eventId) where.eventId = query.eventId;
        if (query.status) where.status = query.status;

        const [items, total] = await Promise.all([
            prisma.processedEvent.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.processedEvent.count({ where }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }
}

export const processedEventService = new ProcessedEventService();
