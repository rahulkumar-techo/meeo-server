import type { FastifyInstance } from "fastify";
import { trackingController } from "../controller/tracking.controller.js";

/**
 * Registers User Behaviour Tracking ingestion routes under /api/v1/tracking.
 */
export async function trackingRouter(app: FastifyInstance) {
    // 1. Batch event ingestion (supports both authenticated users and anonymous sessions)
    app.post(
        "/events",
        {
            preHandler: [(app as any).optionalAuthenticate],
            schema: {
                tags: ["User Behaviour & Tracking"],
                summary: "Ingest batched user behaviour events",
                description: "Appends high-throughput telemetry events (views, searches, cart actions) into raw event storage.",
                security: [{ bearerAuth: [] }],
            },
        },
        trackingController.trackEvents.bind(trackingController),
    );

    // 2. Identity stitching (merges client-side anonymous session buffer to authenticated user)
    app.post(
        "/identify",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["User Behaviour & Tracking"],
                summary: "Stitch anonymous session buffer to authenticated user",
                description: "Flushes client-side buffered events and attributes historical session events to the verified user.",
                security: [{ bearerAuth: [] }],
            },
        },
        trackingController.identify.bind(trackingController),
    );
}

export default trackingRouter;
