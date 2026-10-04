import type { FastifyRequest, FastifyReply } from "fastify";
import {
    batchEventsBody,
    identifyBody,
    user360Params,
    userActivityQuery,
} from "../validations/tracking.validation.js";
import { trackingIngestionService } from "../services/trackingIngestion.service.js";
import { user360Service } from "../services/user360.service.js";
import { AppError } from "@/common/errors/app-error.js";

export class TrackingController {
    /**
     * POST /tracking/events
     * High-speed, non-blocking ingestion of batched events.
     */
    async trackEvents(request: FastifyRequest, reply: FastifyReply) {
        const body = batchEventsBody.parse(request.body);
        const authUser = (request as any).user;
        const userId = authUser?.id || null;

        const result = await trackingIngestionService.ingestBatch({
            userId,
            events: body.events,
        });

        // 202 Accepted confirms receipt for background processing
        return reply.status(202).send({
            success: true,
            ingestedCount: result.ingestedCount,
        });
    }

    /**
     * POST /tracking/identify
     * Merges client-side anonymous session buffer to authenticated user upon login.
     */
    async identify(request: FastifyRequest, reply: FastifyReply) {
        const authUser = (request as any).user;
        if (!authUser?.id) {
            throw new AppError("Authentication required for identity stitching", 401);
        }

        const body = identifyBody.parse(request.body);

        const result = await trackingIngestionService.identifyAndMerge({
            userId: authUser.id,
            sessionId: body.sessionId,
            ...(body.events ? { bufferedEvents: body.events } : {}),
        });

        return reply.status(200).send({
            success: true,
            stitchedEvents: result.stitchedEvents,
            ingestedBufferedEvents: result.ingestedBufferedEvents,
        });
    }

    /**
     * GET /users/:userId/360
     * Pre-aggregated, sub-20ms 360 profile with dynamic permission-based field masking.
     */
    async getUser360(request: FastifyRequest, reply: FastifyReply) {
        const authUser = (request as any).user;
        if (!authUser?.id) {
            throw new AppError("Authentication required", 401);
        }

        const params = user360Params.parse(request.params);

        const data = await user360Service.getUser360(params.userId, {
            userId: authUser.id,
            permissions: authUser.permissions || [],
        });

        return reply.status(200).send({
            success: true,
            data,
        });
    }

    /**
     * GET /users/:userId/360/activity
     * Cursor-based paginated raw activity logs.
     */
    async getUserActivity(request: FastifyRequest, reply: FastifyReply) {
        const authUser = (request as any).user;
        if (!authUser?.id) {
            throw new AppError("Authentication required", 401);
        }

        const params = user360Params.parse(request.params);
        const query = userActivityQuery.parse(request.query);

        const result = await user360Service.getUserActivity(
            params.userId,
            query.cursor,
            query.limit,
            {
                userId: authUser.id,
                permissions: authUser.permissions || [],
            },
        );

        return reply.status(200).send({
            success: true,
            ...result,
        });
    }
}

export const trackingController = new TrackingController();
