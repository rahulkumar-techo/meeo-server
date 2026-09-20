import { authRegistrationService } from "./authRegistration.service.js";
import { authSessionService } from "./authSession.service.js";
import type {
    AuthLoginOption,
    AuthRegisterInput,
    ForgotPasswordInput,
    ResendOtpInput,
    ResetPasswordInput,
    AuthOtpVerification,
    GoogleLoginInput,
} from "./auth.validation.js";

export { authRegistrationService } from "./authRegistration.service.js";
export { authSessionService } from "./authSession.service.js";

/**
 * Unified AuthService orchestrating:
 * - authRegistrationService (Registration, OTP verification, Password resets)
 * - authSessionService (Login, JWT token rotation, Session lifecycle, Google OAuth, Profile resolution)
 */
export class AuthService {
    register(payload: AuthRegisterInput) {
        return authRegistrationService.register(payload);
    }

    verifyOtp(payload: AuthOtpVerification) {
        return authRegistrationService.verifyOtp(payload);
    }

    resendOtp(payload: ResendOtpInput) {
        return authRegistrationService.resendOtp(payload);
    }

    forgotPassword(payload: ForgotPasswordInput) {
        return authRegistrationService.forgotPassword(payload);
    }

    resetPassword(payload: ResetPasswordInput) {
        return authRegistrationService.resetPassword(payload);
    }

    login(payload: AuthLoginOption, metadata?: { ipAddress?: string; userAgent?: string }) {
        return authSessionService.login(payload, metadata);
    }

    refreshToken(refreshToken: string) {
        return authSessionService.refreshToken(refreshToken);
    }

    logout(userId: string, sessionId: string) {
        return authSessionService.logout(userId, sessionId);
    }

    listSessions(userId: string) {
        return authSessionService.listSessions(userId);
    }

    revokeSession(userId: string, sessionId: string) {
        return authSessionService.revokeSession(userId, sessionId);
    }

    revokeAllSessions(userId: string) {
        return authSessionService.revokeAllSessions(userId);
    }

    getCurrentUser(userId: string, sessionId?: string) {
        return authSessionService.getCurrentUser(userId, sessionId);
    }

    authenticateWithGoogle(payload: GoogleLoginInput, metadata?: { ipAddress?: string; userAgent?: string }) {
        return authSessionService.authenticateWithGoogle(payload, metadata);
    }
}

export const authService = new AuthService();