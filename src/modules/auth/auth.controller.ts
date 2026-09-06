import type { FastifyReply, FastifyRequest } from "fastify";

import { authService } from "./auth.service.js";

import {
    authRegister,
    forgotPassword,
    loginSchema,
    otpVerification,
    resendOtp,
    resetPassword,
    type AuthRegisterInput,
} from "./auth.validation.js";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { refreshTokenCookieOptions } from "@/config/cookie.js";
import { AppError } from "@/common/errors/app-error.js";

class AuthController {
    // Register new user
    async authRegister(request: FastifyRequest<{ Body: AuthRegisterInput }>, reply: FastifyReply,) {


        // Validate payload using Zod
        // Note: Ensure your global errorHandler is configured to catch ZodErrors
        const data = authRegister.parse(request.body)
        const user = await authService.register(data);

        return sendCreated({
            reply,
            message: "User registered successfully",
            data: user,
        });
    }


    async login(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {

        const data = loginSchema.parse(request.body);
        const result = await authService.login(data, {
            ipAddress: request.ip,
            ...(request.headers["user-agent"] ? { userAgent: request.headers["user-agent"] } : {}),
        });

        // Store refresh token in HTTP-only cookie
        reply.setCookie("refreshToken", result.refreshToken, refreshTokenCookieOptions,);

        // Keep the cookie for browser clients and expose the token for clients that manage tokens explicitly.
        return sendOk({
            reply,
            message: "Login successful",

            data: {
                user: result.user,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            },
        });
    }

    async verifyOtp(request: FastifyRequest, reply: FastifyReply) {
        const data = otpVerification.parse(request.body);
        const result = await authService.verifyOtp(data);

        return sendOk({
            reply,
            message: "Email verified successfully",
            data: result,
        });
    }

    async resendOtp(request: FastifyRequest, reply: FastifyReply) {
        const data = resendOtp.parse(request.body);
        const result = await authService.resendOtp(data);

        return sendOk({
            reply,
            message: "If the account requires verification, a new OTP has been sent",
            data: result,
        });
    }

    async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
        const data = forgotPassword.parse(request.body);
        const result = await authService.forgotPassword(data);

        return sendOk({
            reply,
            message: "If an account exists, password reset instructions have been sent",
            data: result,
        });
    }

    async resetPassword(request: FastifyRequest, reply: FastifyReply) {
        const data = resetPassword.parse(request.body);
        await authService.resetPassword(data);

        return sendOk({
            reply,
            message: "Password reset successfully",
        });
    }

    async refresh(request: FastifyRequest, reply: FastifyReply) {
        const refreshToken = request.cookies.refreshToken;

        if (!refreshToken) {
            throw new AppError("Refresh token required", 401);
        }

        const result = await authService.refreshToken(refreshToken);
        reply.setCookie("refreshToken", result.refreshToken, refreshTokenCookieOptions);

        return sendOk({
            reply,
            message: "Token refreshed successfully",
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            },
        });
    }

    async logout(request: FastifyRequest, reply: FastifyReply) {
        await authService.logout(request.user.sessionId ?? "");
        reply.clearCookie("refreshToken", refreshTokenCookieOptions);

        return sendOk({
            reply,
            message: "Logged out successfully",
        });
    }

    async listSessions(request: FastifyRequest, reply: FastifyReply) {
        return sendOk({
            reply,
            message: "Sessions fetched successfully",
            data: await authService.listSessions(request.user.userId),
        });
    }

    async revokeSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
        const result = await authService.revokeSession(request.user.userId, request.params.sessionId);
        return sendOk({ reply, message: "Session revoked successfully", data: result });
    }

    async listUserSessions(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
        return sendOk({
            reply,
            message: "User sessions fetched successfully",
            data: await authService.listSessions(request.params.userId),
        });
    }

    async revokeUserSession(request: FastifyRequest<{ Params: { userId: string; sessionId: string } }>, reply: FastifyReply) {
        const result = await authService.revokeSession(request.params.userId, request.params.sessionId);
        return sendOk({ reply, message: "User session revoked successfully", data: result });
    }



    async me(request: FastifyRequest, reply: FastifyReply) {
        const user = await authService.getCurrentUser(request.user.userId);

        return sendOk({
            reply,
            message: "Current user fetched successfully",
            data: user,
        });
    }


}

export const authController = new AuthController();