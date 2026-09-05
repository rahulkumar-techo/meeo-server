import type { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";
import { authSchemas, errorResponse, successResponse, userSchema } from "@/common/docs/swagger.js";

const jsonBody = (schema: object) => ({ body: schema });
const commonErrors = { 400: errorResponse, 401: errorResponse, 422: errorResponse };

const publicAuthRoutes = (app: FastifyInstance) => {
    app.post('/register', { schema: { tags: ["Auth"], summary: "Register a user", ...jsonBody(authSchemas.registerBody), response: { 201: successResponse({ type: "object", properties: { user: userSchema } }), ...commonErrors } } }, authController.authRegister.bind(authController));
    app.post('/verify-otp', { schema: { tags: ["Auth"], summary: "Verify an email OTP", ...jsonBody(authSchemas.emailOtpBody), response: { 200: successResponse(), ...commonErrors } } }, authController.verifyOtp.bind(authController));
    app.post('/resend-otp', { schema: { tags: ["Auth"], summary: "Resend an email OTP", ...jsonBody(authSchemas.emailBody), response: { 200: successResponse(), ...commonErrors } } }, authController.resendOtp.bind(authController));
    app.post('/forgot-password', { schema: { tags: ["Auth"], summary: "Request a password reset", ...jsonBody(authSchemas.emailBody), response: { 200: successResponse(), ...commonErrors } } }, authController.forgotPassword.bind(authController));
    app.post('/reset-password', { schema: { tags: ["Auth"], summary: "Reset a password", ...jsonBody(authSchemas.resetPasswordBody), response: { 200: successResponse(), ...commonErrors } } }, authController.resetPassword.bind(authController));
    app.post('/login', { schema: { tags: ["Auth"], summary: "Log in", ...jsonBody(authSchemas.loginBody), response: { 200: successResponse({ type: "object", properties: { user: userSchema, accessToken: { type: "string" } } }), ...commonErrors } } }, authController.login.bind(authController));
    app.post('/refresh', { schema: { tags: ["Auth"], summary: "Refresh an access token", security: [{ refreshCookie: [] }], response: { 200: successResponse({ type: "object", properties: { accessToken: { type: "string" } } }), 401: errorResponse } } }, authController.refresh.bind(authController));
};

const privateAuthRoutes = (app: FastifyInstance) => {
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