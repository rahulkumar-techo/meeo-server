import type { FastifyInstance } from "fastify";
import { trackingController } from "../controller/tracking.controller.js";

/**
 * Registers User 360 Analytics routes under /api/v1/track-user.
 */
export async function user360Router(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);

    // 1. Pre-aggregated User 360 Profile
    app.get(
        "/:userId/360",
        {
            schema: {
                tags: ["User Behaviour & Tracking"],
                summary: "Get 360-degree user profile and behaviour metrics",
                description: "Retrieves pre-aggregated commerce, engagement, funnel metrics, and top interests with dynamic RBAC field redaction.",
                security: [{ bearerAuth: [] }],
            },
        },
        trackingController.getUser360.bind(trackingController),
    );

    // 2. Paginated User Activity Timeline
    app.get(
        "/:userId/360/activity",
        {
            schema: {
                tags: ["User Behaviour & Tracking"],
                summary: "Get paginated raw user activity timeline",
                description: "Retrieves cursor-paginated raw events for deep customer activity inspection.",
                security: [{ bearerAuth: [] }],
            },
        },
        trackingController.getUserActivity.bind(trackingController),
    );
}

export default user360Router;
