import { prisma } from "@/lib/prisma.js";
import type {
    AuthRegisterInput,
    ForgotPasswordInput,
    ResendOtpInput,
    ResetPasswordInput,
    AuthOtpVerification,
} from "./auth.validation.js";
import argon2 from "argon2";
import { AppError } from "@/common/errors/app-error.js";
import { generateOtp } from "@/common/utils/generateOtp.js";
import redis from "@/lib/redis.js";
import { Keys } from "@/const/keys.js";
import { mailService } from "@/common/mail/send.mail.js";
import { generateOtpEmail } from "@/templates/otp.template.js";

export class AuthRegistrationService {
    async assertOtp(key: string, otp: string) {
        const storedOtp = await redis.get(key);

        if (!storedOtp || storedOtp !== otp) {
            throw new AppError("OTP is invalid or expired", 400);
        }
    }

    async createOtp(key: string) {
        const otp = generateOtp(4);
        await redis.set(key, otp, "EX", 60 * 5);
        return otp;
    }

    /**
     * Registers a new user with email and password, creates verification OTP and dispatches email.
     */
    async register(payload: AuthRegisterInput) {
        const { firstName, lastName, email, password } = payload;

        const passwordHash = await argon2.hash(password);

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                passwordHash,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new AppError("User Not Created", 404);
        }

        const registerOtp = await this.createOtp(Keys.USER_OTP(user.email!));

        const emailContent = generateOtpEmail({
            firstName: user.firstName ?? "Valued",
            lastName: user.lastName ?? "Customer",
            otpCode: registerOtp,
            appName: process.env.APP_NAME || "MEEO",
        });

        await mailService.sendMail({
            to: user.email!,
            subject: `Your Verification Code - ${process.env.APP_NAME || "MEEO"}`,
            html: emailContent.html,
            text: emailContent.text,
        }).catch((err) => {
            console.error(`[AuthRegistration] Failed to send registration OTP email to ${user.email}:`, err.message);
        });

        return { user, tempOtp: registerOtp };
    }

    /**
     * Verifies user email via OTP.
     */
    async verifyOtp({ email, otp }: AuthOtpVerification) {
        await this.assertOtp(Keys.USER_OTP(email), otp);
        await prisma.user.update({
            where: { email },
            data: { emailVerified: true },
        });
        await redis.del(Keys.USER_OTP(email));

        return { verified: true };
    }

    /**
     * Resends OTP for unverified user email and dispatches email.
     */
    async resendOtp({ email }: ResendOtpInput) {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { email: true, emailVerified: true, firstName: true, lastName: true },
        });

        if (!user || user.emailVerified) {
            return {};
        }

        const tempOtp = await this.createOtp(Keys.USER_OTP(email));

        const emailContent = generateOtpEmail({
            firstName: user.firstName ?? "Valued",
            lastName: user.lastName ?? "Customer",
            otpCode: tempOtp,
            appName: process.env.APP_NAME || "MEEO",
        });

        await mailService.sendMail({
            to: email,
            subject: `Your New Verification Code - ${process.env.APP_NAME || "MEEO"}`,
            html: emailContent.html,
            text: emailContent.text,
        }).catch((err) => {
            console.error(`[AuthRegistration] Failed to resend OTP email to ${email}:`, err.message);
        });

        return { tempOtp };
    }

    /**
     * Generates a password reset OTP and dispatches email.
     */
    async forgotPassword({ email }: ForgotPasswordInput) {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { email: true, firstName: true, lastName: true },
        });

        if (!user) {
            return {};
        }

        const tempOtp = await this.createOtp(Keys.PASSWORD_RESET_OTP(email));

        const emailContent = generateOtpEmail({
            firstName: user.firstName ?? "Valued",
            lastName: user.lastName ?? "Customer",
            otpCode: tempOtp,
            appName: process.env.APP_NAME || "MEEO",
        });

        await mailService.sendMail({
            to: email,
            subject: `Password Reset Verification Code - ${process.env.APP_NAME || "MEEO"}`,
            html: emailContent.html,
            text: emailContent.text,
        }).catch((err) => {
            console.error(`[AuthRegistration] Failed to send password reset OTP email to ${email}:`, err.message);
        });

        return { tempOtp };
    }

    /**
     * Validates OTP and updates password, invalidating existing sessions.
     */
    async resetPassword({ email, otp, password }: ResetPasswordInput) {
        await this.assertOtp(Keys.PASSWORD_RESET_OTP(email), otp);
        const passwordHash = await argon2.hash(password);

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (!user) {
            throw new AppError("Unable to reset password", 400);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
        });

        // Password changes invalidate every existing login session.
        await prisma.userSession.deleteMany({
            where: { userId: user.id },
        });
        await redis.del(Keys.PASSWORD_RESET_OTP(email));

        return { reset: true };
    }
}

export const authRegistrationService = new AuthRegistrationService();
