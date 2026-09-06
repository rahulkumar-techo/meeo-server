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
    permissionResponse: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: ["string", "null"] },
        },
    },
    assignedRoleResponse: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
        },
    },
    userResponse: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            email: { type: ["string", "null"], format: "email" },
            firstName: { type: ["string", "null"] },
            lastName: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            emailVerified: { type: "boolean" },
            phoneVerified: { type: "boolean" },
            status: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            roles: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        role: {
                            type: "object",
                            properties: {
                                id: { type: "string", format: "uuid" },
                                name: { type: "string" },
                            },
                        },
                    },
                },
            },
        },
    },
    sessionResponse: {
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            deviceName: { type: ["string", "null"] },
            deviceId: { type: ["string", "null"] },
            ipAddress: { type: ["string", "null"] },
            userAgent: { type: ["string", "null"] },
            expiresAt: { type: "string", format: "date-time" },
            lastUsedAt: { type: ["string", "null"], format: "date-time" },
            revokedAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
        },
    },
    deletedResponse: {
        type: "object",
        properties: { deleted: { type: "boolean" } },
    },
    revokedResponse: {
        type: "object",
        properties: { revoked: { type: "boolean" } },
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
// in the router; this function describes the bearer-token requirement and permissions in Swagger.
export const protectedSchema = (summary: string, description: string, extra: Record<string, unknown> = {}) => ({
    tags: ["Authorization"],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    ...extra,
});

export const authorizationErrors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };

// Controllers use sendOk/sendCreated, so successful responses must describe the
// standard { success, message, data } envelope rather than the data value alone.
export const authorizationResponse = (statusCode: number, data?: object) => ({
    [statusCode]: successResponse(data),
    ...authorizationErrors,
});

export const authorizationListResponse = (items: object) => authorizationResponse(200, { type: "array", items });
