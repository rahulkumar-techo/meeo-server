// Observability Fastify Controller.
// Handles HTTP queries for Prometheus range/instant metrics, Loki logs, and SSE live tail streaming.

import type { FastifyReply, FastifyRequest } from "fastify";
import { observabilityService } from "../services/observability.service.js";
import { observabilityConfigService } from "../services/observabilityConfig.service.js";
import {
    configKeyParamSchema,
    labelParamSchema,
    logsQuerySchema,
    logsStreamQuerySchema,
    metricsInstantQuerySchema,
    metricsRangeQuerySchema,
    updateObservabilityConfigSchema,
} from "../validations/observability.validation.js";

export class ObservabilityController {
    /**
     * Range query for time-series charts (Prometheus).
     */
    async getMetricsRange(req: FastifyRequest, reply: FastifyReply) {
        const input = metricsRangeQuerySchema.parse(req.query);
        const data = await observabilityService.getMetricsRange(input);

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * Instant snapshot query (Prometheus).
     */
    async getMetricsInstant(req: FastifyRequest, reply: FastifyReply) {
        const input = metricsInstantQuerySchema.parse(req.query);
        const data = await observabilityService.getMetricsInstant(input);

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * Lists available system & HTTP metric presets.
     */
    async getPresets(_req: FastifyRequest, reply: FastifyReply) {
        const presets = observabilityService.getPresets();

        return reply.status(200).send({
            success: true,
            status: "success",
            data: presets,
        });
    }

    /**
     * Historical log query via LogQL (Loki).
     */
    async getLogs(req: FastifyRequest, reply: FastifyReply) {
        const input = logsQuerySchema.parse(req.query);
        const data = await observabilityService.getLogs(input);

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * Lists all indexed log labels.
     */
    async getLogLabels(_req: FastifyRequest, reply: FastifyReply) {
        const labels = await observabilityService.getLogLabels();

        return reply.status(200).send({
            success: true,
            status: "success",
            data: labels,
        });
    }

    /**
     * Retrieves unique values for a specific label name.
     */
    async getLogLabelValues(req: FastifyRequest, reply: FastifyReply) {
        const { name } = labelParamSchema.parse(req.params);
        const values = await observabilityService.getLogLabelValues(name);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: values,
        });
    }

    // Concurrency limit for live log streams to prevent memory exhaustion and socket starvation
    private static activeLiveStreams = 0;
    private static readonly MAX_CONCURRENT_LIVE_STREAMS = 5;

    /**
     * Streams live logs in real-time to the browser via Server-Sent Events (SSE).
     * Subscribes to Loki's /loki/api/v1/tail WebSocket endpoint under the hood.
     * Protected with strict concurrency limits and backpressure controls.
     */
    async streamLiveLogs(req: FastifyRequest, reply: FastifyReply) {
        if (ObservabilityController.activeLiveStreams >= ObservabilityController.MAX_CONCURRENT_LIVE_STREAMS) {
            return reply.status(429).send({
                success: false,
                statusCode: 429,
                error: "Too Many Requests",
                message: `Maximum concurrent live log stream sessions (${ObservabilityController.MAX_CONCURRENT_LIVE_STREAMS}) reached. Please close another active session.`,
            });
        }

        const { query } = logsStreamQuerySchema.parse(req.query);

        ObservabilityController.activeLiveStreams++;

        // Configure SSE response headers
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });
        reply.raw.flushHeaders?.();

        // Initial connection handshake event
        reply.raw.write(
            `event: connected\ndata: ${JSON.stringify({
                status: "connected",
                query,
                timestamp: new Date().toISOString(),
            })}\n\n`,
        );

        // Keep-alive heartbeat interval (every 15s)
        const heartbeatTimer = setInterval(() => {
            if (!reply.raw.writableEnded && !reply.raw.destroyed) {
                reply.raw.write(": heartbeat\n\n");
            }
        }, 15000);

        // Connect to Loki live tailing WebSocket with batch safety cap
        const session = observabilityService.streamLiveLogs(
            query,
            (entries) => {
                if (reply.raw.writableEnded || reply.raw.destroyed) return;

                // Micro-batch safety: limit to 50 logs per tick to avoid event loop freeze
                const batch = entries.slice(0, 50);
                for (const entry of batch) {
                    reply.raw.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
                }
            },
            (err) => {
                if (!reply.raw.writableEnded && !reply.raw.destroyed) {
                    reply.raw.write(
                        `event: error\ndata: ${JSON.stringify({
                            error: err.message,
                            timestamp: new Date().toISOString(),
                        })}\n\n`,
                    );
                }
            },
            () => {
                if (!reply.raw.writableEnded && !reply.raw.destroyed) {
                    reply.raw.write("event: end\ndata: {}\n\n");
                    reply.raw.end();
                }
            },
        );

        // Cleanup resources and decrement stream count when the frontend client disconnects
        req.raw.on("close", () => {
            ObservabilityController.activeLiveStreams = Math.max(0, ObservabilityController.activeLiveStreams - 1);
            clearInterval(heartbeatTimer);
            session.close();
            if (!reply.raw.writableEnded) {
                reply.raw.end();
            }
        });
    }

    /**
     * BullMQ background job queues overview and telemetry.
     */
    async getQueues(_req: FastifyRequest, reply: FastifyReply) {
        const data = await observabilityService.getQueueOverview();

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * BullMQ jobs query by queue and status.
     */
    async getQueueJobs(req: FastifyRequest, reply: FastifyReply) {
        const data = await observabilityService.getQueueJobs(req.query as any);

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * Service topology nodes and edges for React Flow architecture map.
     */
    async getTopology(_req: FastifyRequest, reply: FastifyReply) {
        const data = await observabilityService.getServiceTopology();

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * OpenTelemetry distributed traces with waterfall spans.
     */
    async getTraces(_req: FastifyRequest, reply: FastifyReply) {
        const data = await observabilityService.getOtelTraces();

        return reply.status(200).send({
            success: true,
            status: "success",
            data,
        });
    }

    /**
     * Retrieves all observability threshold configurations (served from L1/L2 cache).
     */
    async getConfigs(_req: FastifyRequest, reply: FastifyReply) {
        const configs = await observabilityConfigService.getAllConfigs();

        return reply.status(200).send({
            success: true,
            status: "success",
            data: configs,
        });
    }

    /**
     * Updates an observability threshold configuration and invalidates cache.
     */
    async updateConfig(req: FastifyRequest, reply: FastifyReply) {
        const params = configKeyParamSchema.parse(req.params);
        const body = updateObservabilityConfigSchema.parse(req.body);
        const adminUserId = (req.user as any)?.id;

        const updated = await observabilityConfigService.updateConfig(params.key, body, adminUserId);

        return reply.status(200).send({
            success: true,
            status: "success",
            message: `Observability configuration '${params.key}' updated successfully`,
            data: updated,
        });
    }

    /**
     * Resets all observability threshold configurations to default baseline.
     */
    async resetConfigs(req: FastifyRequest, reply: FastifyReply) {
        const adminUserId = (req.user as any)?.id;
        const configs = await observabilityConfigService.resetToDefaults(adminUserId);

        return reply.status(200).send({
            success: true,
            status: "success",
            message: "Observability configurations reset to default baseline",
            data: configs,
        });
    }
}

export const observabilityController = new ObservabilityController();
