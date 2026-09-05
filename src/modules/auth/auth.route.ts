import type { FastifyInstance } from "fastify";
import { authController } from "./auth.controller.js";

const publicAuthRoutes = (app: FastifyInstance) => {
    app.post('/register', authController.authRegister.bind(authController));
    app.post('/verify-otp', authController.verifyOtp.bind(authController));
    app.post('/resend-otp', authController.resendOtp.bind(authController));
    app.post('/forgot-password', authController.forgotPassword.bind(authController));
    app.post('/reset-password', authController.resetPassword.bind(authController));
    app.post('/login', authController.login.bind(authController));
    app.post('/refresh', authController.refresh.bind(authController));
};

const privateAuthRoutes = (app: FastifyInstance) => {
    app.get('/me', {
        preHandler: app.authenticate,
    }, authController.me.bind(authController));
};

const authRouter = (app: FastifyInstance) => {
    app.register(publicAuthRoutes);
    app.register(privateAuthRoutes);
};

export default authRouter;