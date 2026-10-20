import fastifyHttpProxy from "@fastify/http-proxy";
import type { FastifyInstance } from "fastify";

export const apiGateway = async (app: FastifyInstance): Promise<void> => {
    const aiUpstream = (process.env.AI_AGENT_URL || "http://localhost:8000").replace(/\/$/, "");
    const internalSecret = process.env.INTERNAL_SERVICE_KEY || "meeo_internal_sec_98f4c281a93b7e416d80e9f1a23c55d0";

    // AI Gateway Route:
    await app.register(fastifyHttpProxy, {
        upstream: aiUpstream,
        prefix: "/api/v1/ai",
        rewritePrefix: "", // /api/v1/ai/ will route directly to http://localhost:8000/
        http2: false,
        preHandler: app.optionalAuthenticate,
        replyOptions: {
            rewriteRequestHeaders: (request: any, headers: any) => {
                const updatedHeaders: Record<string, string | string[] | undefined> = {
                    ...headers,
                    // 1. Service-to-Service Secret Authentication
                    "x-internal-secret": internalSecret,

                    // 2. Distributed Tracing Request ID
                    "x-request-id": request.id,
                };

                // 3. User Identity Propagation (if authenticated user)
                if (request.user?.id) {
                    updatedHeaders["x-user-id"] = String(request.user.id);
                }
                if (request.user?.email) {
                    updatedHeaders["x-user-email"] = String(request.user.email);
                }

                return updatedHeaders;
            },
        },
    });
};
