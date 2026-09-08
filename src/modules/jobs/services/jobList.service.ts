import { domainEventQueue, deadLetterQueue } from "@/lib/queue.js";
import { prisma } from "@/lib/prisma.js";
import type { QueryJobsInput, JobFilterCategory } from "../validations/job.validation.js";

export interface JobTableRow {
    id: string;
    jobId: string;
    status: "WAITING" | "ACTIVE" | "COMPLETED" | "FAILED" | "DELAYED" | "DEAD_LETTER";
    handler: string;
    queue: string;
    category: JobFilterCategory;
    worker: string;
    runtime: string;
    runtimeMs: number;
    attempt: string;
    attemptsCount: number;
    maxAttempts: number;
    payloadSummary: string;
    failedReason: string | null;
    createdAt: string;
    processedAt: string | null;
    actions: ("RETRY" | "CANCEL" | "INSPECT")[];
}

export class JobListService {
    /**
     * Determines handler name based on eventType and payload.
     */
    private resolveHandler(eventType: string): string {
        if (eventType.startsWith("ORDER_")) return "orderEventsConsumer";
        if (eventType.startsWith("PAYMENT_")) return "paymentEventsConsumer";
        if (eventType.startsWith("LOW_STOCK") || eventType.startsWith("NOTIFICATION") || eventType.startsWith("MARKETING")) {
            return "notificationConsumer";
        }
        return "outboxPublisher";
    }

    /**
     * Categorizes event into the designated queue filter.
     */
    private resolveCategory(eventType: string, isDeadLetter: boolean): JobFilterCategory {
        if (isDeadLetter) return "DEAD_LETTER_TRIGGER";
        if (eventType.startsWith("PAYMENT_") || eventType === "ORDER_CREATED" || eventType === "ORDER_CONFIRMED") {
            return "CRITICAL_CHECKOUTS";
        }
        if (eventType === "ORDER_SHIPPED" || eventType === "ORDER_DELIVERED") {
            return "ORDER_FULFILLMENT_SYNC";
        }
        if (eventType.startsWith("PROMOTION") || eventType.startsWith("MARKETING") || eventType.startsWith("LOW_STOCK")) {
            return "MARKETING_EMAIL_BATCH";
        }
        return "CRITICAL_CHECKOUTS";
    }

    /**
     * Resolves target queue name based on category.
     */
    private resolveQueueName(category: JobFilterCategory): string {
        switch (category) {
            case "DEAD_LETTER_TRIGGER":
                return "dead-letter-events";
            case "ORDER_FULFILLMENT_SYNC":
                return "order-fulfillment-sync";
            case "MARKETING_EMAIL_BATCH":
                return "marketing-email-batch";
            case "CRITICAL_CHECKOUTS":
            case "ALL":
            default:
                return "domain-events";
        }
    }

    /**
     * Queries and paginates background jobs formatted for the table view.
     */
    async listJobs(query: QueryJobsInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};

        // 1. Status Filter
        if (query.status) {
            if (query.status === "DEAD_LETTER") {
                where.status = "FAILED";
                where.attempts = { gte: 10 };
            } else if (query.status === "FAILED") {
                where.status = "FAILED";
            } else if (query.status === "ACTIVE") {
                where.status = "PROCESSING";
            } else if (query.status === "WAITING") {
                where.status = "PENDING";
            } else if (query.status === "COMPLETED") {
                where.status = "PUBLISHED";
            }
        }

        // 2. Category / Queue Filter
        if (query.filter && query.filter !== "ALL") {
            if (query.filter === "DEAD_LETTER_TRIGGER") {
                where.status = "FAILED";
                where.attempts = { gte: 5 };
            } else if (query.filter === "CRITICAL_CHECKOUTS") {
                where.eventType = { in: ["ORDER_CREATED", "ORDER_CONFIRMED", "PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "PAYMENT_INITIALIZED"] };
            } else if (query.filter === "ORDER_FULFILLMENT_SYNC") {
                where.eventType = { in: ["ORDER_SHIPPED", "ORDER_DELIVERED", "ORDER_CANCELLED"] };
            } else if (query.filter === "MARKETING_EMAIL_BATCH") {
                where.eventType = { in: ["PROMOTION", "LOW_STOCK", "SECURITY_ALERT"] };
            }
        }

        // 3. Search filter
        if (query.search) {
            where.OR = [
                { id: { contains: query.search, mode: "insensitive" } },
                { eventType: { contains: query.search, mode: "insensitive" } },
                { aggregateId: { contains: query.search, mode: "insensitive" } },
            ];
        }

        const [events, total] = await Promise.all([
            prisma.outboxEvent.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.outboxEvent.count({ where }),
        ]);

        const rows: JobTableRow[] = events.map((event) => {
            const isDeadLetter = event.status === "FAILED" && event.attempts >= event.maxAttempts;
            const category = this.resolveCategory(event.eventType, isDeadLetter);
            const handler = this.resolveHandler(event.eventType);
            const queueName = this.resolveQueueName(category);

            let tableStatus: JobTableRow["status"] = "COMPLETED";
            if (isDeadLetter) tableStatus = "DEAD_LETTER";
            else if (event.status === "FAILED") tableStatus = "FAILED";
            else if (event.status === "PROCESSING") tableStatus = "ACTIVE";
            else if (event.status === "PENDING") {
                tableStatus = event.nextRetryAt && event.nextRetryAt > new Date() ? "DELAYED" : "WAITING";
            }

            const runtimeMs = event.publishedAt
                ? Math.max(12, event.publishedAt.getTime() - event.createdAt.getTime())
                : 0;

            const runtimeString = runtimeMs > 0 ? `${runtimeMs} ms` : "-";
            const actions: JobTableRow["actions"] = [];

            if (tableStatus === "FAILED" || tableStatus === "DEAD_LETTER") {
                actions.push("RETRY", "CANCEL", "INSPECT");
            } else if (tableStatus === "WAITING" || tableStatus === "DELAYED") {
                actions.push("CANCEL", "INSPECT");
            } else {
                actions.push("INSPECT");
            }

            const payloadStr = JSON.stringify(event.payload || {});
            const payloadSummary = payloadStr.length > 60 ? `${payloadStr.substring(0, 57)}...` : payloadStr;

            return {
                id: event.id,
                jobId: event.id,
                status: tableStatus,
                handler,
                queue: queueName,
                category,
                worker: event.lockedBy || `worker-pod-${event.id.slice(0, 6)}`,
                runtime: runtimeString,
                runtimeMs,
                attempt: `${event.attempts}/${event.maxAttempts}`,
                attemptsCount: event.attempts,
                maxAttempts: event.maxAttempts,
                payloadSummary,
                failedReason: event.lastError,
                createdAt: event.createdAt.toISOString(),
                processedAt: event.publishedAt ? event.publishedAt.toISOString() : null,
                actions,
            };
        });

        return {
            items: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }
}

export const jobListService = new JobListService();
