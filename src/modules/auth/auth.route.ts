import type { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";
import { authSchemas, errorResponse, successResponse, tempOtpResponse, tokenResponse, userSchema } from "@/common/docs/swagger.js";

const jsonBody = (schema: object) => ({ body: schema });
const commonErrors = { 400: errorResponse, 401: errorResponse, 422: errorResponse };

const publicAuthRoutes = (app: FastifyInstance) => {
    app.post('/register', { schema: { tags: ["Auth"], summary: "Register a user", ...jsonBody(authSchemas.registerBody), response: { 201: successResponse({ type: "object", properties: { user: userSchema, tempOtp: tempOtpResponse.properties.tempOtp } }), ...commonErrors } } }, authController.authRegister.bind(authController));
    app.post('/verify-otp', { schema: { tags: ["Auth"], summary: "Verify an email OTP", ...jsonBody(authSchemas.emailOtpBody), response: { 200: successResponse(), ...commonErrors } } }, authController.verifyOtp.bind(authController));
    app.post('/resend-otp', { schema: { tags: ["Auth"], summary: "Resend an email OTP", ...jsonBody(authSchemas.emailBody), response: { 200: successResponse(tempOtpResponse), ...commonErrors } } }, authController.resendOtp.bind(authController));
    app.post('/forgot-password', { schema: { tags: ["Auth"], summary: "Request a password reset", ...jsonBody(authSchemas.emailBody), response: { 200: successResponse(tempOtpResponse), ...commonErrors } } }, authController.forgotPassword.bind(authController));
    app.post('/reset-password', { schema: { tags: ["Auth"], summary: "Reset a password", ...jsonBody(authSchemas.resetPasswordBody), response: { 200: successResponse(), ...commonErrors } } }, authController.resetPassword.bind(authController));
    app.post('/login', { schema: { tags: ["Auth"], summary: "Log in", ...jsonBody(authSchemas.loginBody), response: { 200: successResponse({ type: "object", properties: { user: userSchema, accessToken: tokenResponse.properties.accessToken, refreshToken: tokenResponse.properties.refreshToken } }), ...commonErrors } } }, authController.login.bind(authController));
    app.post('/refresh', { schema: { tags: ["Auth"], summary: "Refresh an access token", security: [{ refreshCookie: [] }], response: { 200: successResponse(tokenResponse), 401: errorResponse } } }, authController.refresh.bind(authController));
};

const privateAuthRoutes = (app: FastifyInstance) => {
    const sessionParams = { type: "object", required: ["sessionId"], properties: { sessionId: { type: "string", format: "uuid" } } };

    app.post('/logout', {
        preHandler: app.authenticate,
        schema: {
            tags: ["Auth"],
            summary: "Log out",
            security: [{ bearerAuth: [] }],
            response: { 200: successResponse(), 401: errorResponse },
        },
    }, authController.logout.bind(authController));

    app.get('/sessions', {
        preHandler: app.authenticate,
        schema: { tags: ["Auth"], summary: "List current user sessions", security: [{ bearerAuth: [] }], response: { 200: successResponse({ type: "array", items: { type: "object" } }), 401: errorResponse } },
    }, authController.listSessions.bind(authController));

    app.delete<{ Params: { sessionId: string } }>('/sessions/:sessionId', {
        preHandler: app.authenticate,
        schema: { tags: ["Auth"], summary: "Revoke a session", security: [{ bearerAuth: [] }], params: sessionParams, response: { 200: successResponse(), 401: errorResponse, 404: errorResponse } },
    }, authController.revokeSession.bind(authController));

    app.get('/me', {
        preHandler: app.authenticate,
        schema: {
            tags: ["Auth"],
            summary: "Get the current user",
            security: [{ bearerAuth: [] }],
            response: { 200: successResponse(userSchema), 401: errorResponse },
        },
    }, authController.me.bind(authController));
};

const authRouter = (app: FastifyInstance) => {
    app.register(publicAuthRoutes);
    app.register(privateAuthRoutes);
};

export default authRouter;