import type { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";
import { authenticationSchemas } from "@/common/docs/authentication.js";

const publicAuthRoutes = (app: FastifyInstance) => {
    // Public routes do not use the access-token guard. Individual handlers still validate their request bodies.
    app.post(
        "/register",
        authenticationSchemas.register,
        authController.authRegister.bind(authController),
    );
    app.post(
        "/verify-otp",
        authenticationSchemas.verifyOtp,
        authController.verifyOtp.bind(authController),
    );
    app.post(
        "/resend-otp",
        authenticationSchemas.resendOtp,
        authController.resendOtp.bind(authController),
    );
    app.post(
        "/forgot-password",
        authenticationSchemas.forgotPassword,
        authController.forgotPassword.bind(authController),
    );
    app.post(
        "/reset-password",
        authenticationSchemas.resetPassword,
        authController.resetPassword.bind(authController),
    );
    app.post(
        "/login",
        authenticationSchemas.login,
        authController.login.bind(authController),
    );
    app.post(
        "/refresh",
        authenticationSchemas.refresh,
        authController.refresh.bind(authController),
    );
};

const privateAuthRoutes = (app: FastifyInstance) => {
    // These routes require a valid access token. The preHandler authenticates the user before the controller runs.
    // It also verifies the user's status and, when present, the session ID in the token.
    app.post(
        "/logout",
        { preHandler: app.authenticate, ...authenticationSchemas.logout },
        authController.logout.bind(authController),
    );

    app.post(
        "/logout-all",
        { preHandler: app.authenticate, ...authenticationSchemas.logoutAll },
        authController.logoutAll.bind(authController),
    );

    app.get(
        "/sessions",
        { preHandler: app.authenticate, ...authenticationSchemas.sessions },
        authController.listSessions.bind(authController),
    );

    app.delete<{ Params: { sessionId: string } }>(
        "/sessions/:sessionId",
        { preHandler: app.authenticate, ...authenticationSchemas.revokeSession },
        authController.revokeSession.bind(authController),
    );

    app.get(
        "/me",
        { preHandler: app.authenticate, ...authenticationSchemas.me },
        authController.me.bind(authController),
    );
};

const authRouter = (app: FastifyInstance) => {
    app.register(publicAuthRoutes);
    app.register(privateAuthRoutes);
};

export default authRouter;