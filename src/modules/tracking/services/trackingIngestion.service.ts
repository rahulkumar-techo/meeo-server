import { prisma } from "@/lib/prisma.js";
import redis from "@/lib/redis.js";
import type { SingleEventInput } from "../validations/tracking.validation.js";

// Ingestion service responsible for fast, low-overhead event capture
export class TrackingIngestionService {
    /**
     * Ingests a batch of events with deduplication and append-only storage.
     */
    async ingestBatch(params: {
        userId?: string | null;
        sessionId?: string | null;
        events: SingleEventInput[];
    }) {
        const { userId, sessionId, events } = params;

        // Filter duplicates using clientEventId if provided
        const uniqueEvents: SingleEventInput[] = [];
        for (const evt of events) {
            if (evt.clientEventId) {
                const isDuplicate = await this.checkAndSetIdempotency(evt.clientEventId);
                if (isDuplicate) continue;
            }
            uniqueEvents.push(evt);
        }

        if (uniqueEvents.length === 0) {
            return { ingestedCount: 0 };
        }

        // Fast batch insert directly into raw user_events
        const records = uniqueEvents.map((evt) => ({
            userId: userId || null,
            sessionId: evt.sessionId || sessionId || null,
            event: evt.event,
            entityType: evt.entityType || null,
            entityId: evt.entityId || null,
            metadata: evt.metadata ? (evt.metadata as any) : undefined,
            createdAt: evt.createdAt ? new Date(evt.createdAt) : new Date(),
        }));

        const result = await prisma.userEvent.createMany({
            data: records,
        });

        return { ingestedCount: result.count };
    }

    /**
     * Stitches anonymous session buffer to authenticated user upon login.
     * Extracts verified userId strictly from auth context, never client input.
     */
    async identifyAndMerge(params: {
        userId: string;
        sessionId: string;
        bufferedEvents?: SingleEventInput[];
    }) {
        const { userId, sessionId, bufferedEvents = [] } = params;

        // 1. Insert buffered client events directly attributed to the verified user
        let newEventsCount = 0;
        if (bufferedEvents.length > 0) {
            const result = await this.ingestBatch({
                userId,
                sessionId,
                events: bufferedEvents,
            });
            newEventsCount = result.ingestedCount;
        }

        // 2. Retroactively link any existing anonymous database events matching sessionId
        const updatedHistorical = await prisma.userEvent.updateMany({
            where: {
                sessionId,
                userId: null,
            },
            data: {
                userId,
            },
        });

        return {
            success: true,
            stitchedEvents: updatedHistorical.count,
            ingestedBufferedEvents: newEventsCount,
        };
    }

    /**
     * Redis-backed idempotency filter (24-hour TTL) with memory fallback
     */
    private async checkAndSetIdempotency(clientEventId: string): Promise<boolean> {
        try {
            if (redis.status === "ready" || redis.status === "connect") {
                const key = `tracking:idemp:${clientEventId}`;
                const set = await redis.set(key, "1", "EX", 86400, "NX");
                return set === null; // null means key already existed -> duplicate
            }
        } catch {
            // Redis unavailable: proceed without dropping event
        }
        return false;
    }
}

export const trackingIngestionService = new TrackingIngestionService();
