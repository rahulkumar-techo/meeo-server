import { errorResponse, successResponse, tempOtpResponse, tokenResponse, userSchema } from "./swagger.js";

// Keep authentication OpenAPI metadata separate from route registration and controller code.
const jsonBody = (schema: object) => ({ body: schema });
const commonErrors = { 400: errorResponse, 401: errorResponse, 422: errorResponse };

// These objects are passed directly to Fastify route definitions through the `schema` property.
// `required` controls request validation; optional device fields must not be added there.
export const authenticationSchemas = {
    register: {
        schema: {
            tags: ["Auth"],
            summary: "Register a user",
            ...jsonBody({
                type: "object",
                required: ["firstName", "lastName", "email", "password"],
                properties: {
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password", minLength: 5, maxLength: 12 },
                },
            }),
            response: {
                201: successResponse({ type: "object", properties: { user: userSchema, tempOtp: tempOtpResponse.properties.tempOtp } }),
                ...commonErrors,
            },
        },
    },
    verifyOtp: {
        schema: {
            tags: ["Auth"],
            summary: "Verify an email OTP",
            ...jsonBody({
                type: "object",
                required: ["email", "otp"],
                properties: {
                    email: { type: "string", format: "email" },
                    otp: { type: "string", pattern: "^[0-9]{4}$" },
                },
            }),
            response: { 200: successResponse(), ...commonErrors },
        },
    },
    emailAction: {
        schema: {
            tags: ["Auth"],
            ...jsonBody({
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
            }),
            response: { 200: successResponse(tempOtpResponse), ...commonErrors },
        },
    },
    resetPassword: {
        schema: {
            tags: ["Auth"],
            summary: "Reset a password",
            ...jsonBody({
                type: "object",
                required: ["email", "otp", "password"],
                properties: {
                    email: { type: "string", format: "email" },
                    otp: { type: "string", pattern: "^[0-9]{4}$" },
                    password: { type: "string", format: "password", minLength: 5, maxLength: 12 },
                },
            }),
            response: { 200: successResponse(), ...commonErrors },
        },
    },
    login: {
        schema: {
            tags: ["Auth"],
            summary: "Log in",
            ...jsonBody({
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: { type: "string", format: "email", default: "testing01@gmail.com" },
                    password: { type: "string", format: "password", default: "testing@01" },
                    deviceName: { type: "string", maxLength: 100, description: "Friendly device name" },
                    deviceId: { type: "string", maxLength: 255, description: "Stable client device identifier" },
                },
            }),
            response: { 200: successResponse({ type: "object", properties: { user: userSchema, accessToken: tokenResponse.properties.accessToken, refreshToken: tokenResponse.properties.refreshToken } }), ...commonErrors },
        },
    },
    refresh: {
        schema: { tags: ["Auth"], summary: "Refresh an access token", security: [{ refreshCookie: [] }], response: { 200: successResponse(tokenResponse), 401: errorResponse } },
    },
    logout: {
        schema: { tags: ["Auth"], summary: "Log out", security: [{ bearerAuth: [] }], response: { 200: successResponse(), 401: errorResponse } },
    },
    logoutAll: {
        schema: { tags: ["Auth"], summary: "Log out from all devices", security: [{ bearerAuth: [] }], response: { 200: successResponse(), 401: errorResponse } },
    },
    sessions: {
        schema: { tags: ["Auth"], summary: "List current user sessions", security: [{ bearerAuth: [] }], response: { 200: successResponse({ type: "array", items: { type: "object" } }), 401: errorResponse } },
    },
    revokeSession: {
        schema: { tags: ["Auth"], summary: "Revoke a session", security: [{ bearerAuth: [] }], params: { type: "object", required: ["sessionId"], properties: { sessionId: { type: "string", format: "uuid" } } }, response: { 200: successResponse(), 401: errorResponse, 404: errorResponse } },
    },
    me: {
        schema: { tags: ["Auth"], summary: "Get the current user", security: [{ bearerAuth: [] }], response: { 200: successResponse(userSchema), 401: errorResponse } },
    },
};
