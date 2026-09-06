import { errorResponse, successResponse } from "./swagger.js";

// Request and response shapes for admin routes live here so authorization.route.ts stays focused
// on guards, handlers, and endpoint registration.
export const authorizationSchemas = {
    role: {
        type: "object",
        required: ["name"],
        properties: {
            name: { type: "string", pattern: "^[A-Z0-9_]+$" },
            description: { type: "string" },
        },
    },
    roleParams: {
        type: "object",
        required: ["roleId"],
        properties: { roleId: { type: "string", format: "uuid" } },
    },
    userParams: {
        type: "object",
        required: ["userId"],
        properties: { userId: { type: "string", format: "uuid" } },
    },
    roleResponse: {
        type: "object",
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: ["string", "null"] },
            permissions: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        permission: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                name: { type: "string" },
                                description: { type: ["string", "null"] },
                            },
                        },
                    },
                },
            },
        },
    },
    permissionAssignment: {
        type: "object",
        required: ["permissionIds"],
        properties: { permissionIds: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 100 } },
    },
    roleAssignment: {
        type: "object",
        required: ["roleIds"],
        properties: { roleIds: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 50 } },
    },
    userUpdate: {
        type: "object",
        minProperties: 1,
        properties: {
            firstName: { type: "string", minLength: 1 },
            lastName: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "BLOCKED", "PENDING_VERIFICATION"] },
        },
    },
    sessionParams: {
        type: "object",
        required: ["userId", "sessionId"],
        properties: {
            userId: { type: "string", format: "uuid" },
            sessionId: { type: "string", format: "uuid" },
        },
    },
};

// Adds the shared OpenAPI security metadata. The runtime authenticate hook is registered separately
// in the router; this function only describes the bearer-token requirement in Swagger.
export const protectedSchema = (summary: string, extra: Record<string, unknown> = {}) => ({
    tags: ["Authorization"],
    summary,
    security: [{ bearerAuth: [] }],
    ...extra,
});

export const authorizationErrors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };

export const authorizationListResponse = (items: object) => ({
    200: successResponse({ type: "array", items }),
    ...authorizationErrors,
});
