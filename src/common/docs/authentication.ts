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
            summary: "[Public] Register a new user",
            description: "Register a new user account with email and password. Generates and sends a 4-digit verification OTP to the provided email.",
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
            summary: "[Public] Verify email OTP",
            description: "Verifies the 4-digit email registration OTP and marks the account as emailVerified.",
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
    resendOtp: {
        schema: {
            tags: ["Auth"],
            summary: "[Public] Resend email OTP",
            description: "Generates and sends a fresh 4-digit verification OTP to the user's email.",
            ...jsonBody({
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
            }),
            response: { 200: successResponse(tempOtpResponse), ...commonErrors },
        },
    },
    forgotPassword: {
        schema: {
            tags: ["Auth"],
            summary: "[Public] Request password reset OTP",
            description: "Sends a 4-digit password reset OTP to the user's registered email address.",
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
            summary: "[Public] Reset password",
            description: "Resets account password using the verified 4-digit reset OTP sent to email.",
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
            summary: "[Public] User login",
            description: "Authenticates email and password, creates a trackable session with optional device metadata, returns a short-lived JWT accessToken, and sets an HttpOnly refreshToken cookie.",
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
        schema: {
            tags: ["Auth"],
            summary: "[Public / Cookie] Refresh access token",
            description: "Exchanges a valid HttpOnly refreshToken cookie for a new short-lived JWT accessToken.",
            security: [{ refreshCookie: [] }],
            response: { 200: successResponse(tokenResponse), 401: errorResponse },
        },
    },
    logout: {
        schema: {
            tags: ["Auth"],
            summary: "[Authenticated User] Log out current session",
            description: "Revokes the current active session in the database and clears the refresh cookie.",
            security: [{ bearerAuth: [] }],
            response: { 200: successResponse(), 401: errorResponse },
        },
    },
    logoutAll: {
        schema: {
            tags: ["Auth"],
            summary: "[Authenticated User] Log out all sessions",
            description: "Revokes all active sessions across all devices for the authenticated user and clears cookies.",
            security: [{ bearerAuth: [] }],
            response: { 200: successResponse(), 401: errorResponse },
        },
    },
    sessions: {
        schema: {
            tags: ["Auth"],
            summary: "[Authenticated User] List active sessions",
            description: "Retrieves all active device sessions, IP addresses, and user-agent information for the authenticated user.",
            security: [{ bearerAuth: [] }],
            response: { 200: successResponse({ type: "array", items: { type: "object" } }), 401: errorResponse },
        },
    },
    revokeSession: {
        schema: {
            tags: ["Auth"],
            summary: "[Authenticated User] Revoke a specific session",
            description: "Revokes a specific session belonging to the authenticated user by sessionId.",
            security: [{ bearerAuth: [] }],
            params: { type: "object", required: ["sessionId"], properties: { sessionId: { type: "string", format: "uuid" } } },
            response: { 200: successResponse(), 401: errorResponse, 404: errorResponse },
        },
    },
    me: {
        schema: {
            tags: ["Auth"],
            summary: "[Authenticated User] Get current user profile & roles",
            description: "Returns the authenticated user's profile details, assigned roles, and granular permissions.",
            security: [{ bearerAuth: [] }],
            response: { 200: successResponse(userSchema), 401: errorResponse },
        },
    },
};
