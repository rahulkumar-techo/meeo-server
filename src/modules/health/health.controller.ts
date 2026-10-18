import type { FastifyReply, FastifyRequest } from "fastify";
import { healthService } from "./health.service.js";
import { errorTracker } from "@/common/observability/errorTracker.js";

export class HealthController {
    /**
     * Fast Liveness probe: returns 200 OK with process uptime.
     */
    async live(_req: FastifyRequest, reply: FastifyReply) {
        const liveness = healthService.getLiveness();
        return reply.status(200).send({
            success: true,
            data: liveness,
        });
    }

    /**
     * Deep Readiness probe: checks DB, Redis, Mail. Returns 200 or 503.
     */
    async ready(_req: FastifyRequest, reply: FastifyReply) {
        const report = await healthService.getReadiness();
        const statusCode = report.status === "unhealthy" ? 503 : 200;

        return reply.status(statusCode).send({
            success: report.status !== "unhealthy",
            data: report,
        });
    }

    /**
     * Inspects background event workers and poller heartbeats.
     */
    async workers(_req: FastifyRequest, reply: FastifyReply) {
        const data = await healthService.getWorkerHealth();
        return reply.status(200).send({
            success: true,
            data,
        });
    }

    /**
     * BullMQ job queue metrics breakdown.
     */
    async queues(_req: FastifyRequest, reply: FastifyReply) {
        const data = await healthService.getQueueHealth();
        return reply.status(200).send({
            success: true,
            data,
        });
    }


    /**
     * Diagnostics: returns recent error reports captured by ErrorTracker.
     */
    async recentErrors(_req: FastifyRequest, reply: FastifyReply) {
        const errors = errorTracker.getRecentErrors(20);
        return reply.status(200).send({
            success: true,
            data: {
                totalRecentErrors: errors.length,
                errors,
            },
        });
    }
}

export const healthController = new HealthController();
