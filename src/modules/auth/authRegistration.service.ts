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
import { generateOtpEmail } from "@/templates/otp.template.js";
import { notificationDeliveryService } from "@/workers/services/notificationDelivery.service.js";

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
     * Registers a new user with default CUSTOMER role, creates verification OTP and dispatches email.
     * If the email exists but is unverified, refreshes their info, generates a fresh OTP, and dispatches verification email.
     */
    async register(payload: AuthRegisterInput) {
        const { firstName, lastName, email, password } = payload;

        const passwordHash = await argon2.hash(password);

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                emailVerified: true,
            },
        });

        if (existingUser?.emailVerified) {
            throw new AppError("Email already registered", 400);
        }

        let user;
        if (existingUser) {
            // Unverified user resubmitting signup: update credentials & names, then issue fresh OTP
            user = await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    firstName,
                    lastName,
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
        } else {
            user = await prisma.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    passwordHash,
                    roles: {
                        create: {
                            role: {
                                connectOrCreate: {
                                    where: { name: "CUSTOMER" },
                                    create: { name: "CUSTOMER", description: "Default customer role" },
                                },
                            },
                        },
                    },
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
        }

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

        // Stage transactional outbox event for background email dispatch
        await prisma.outboxEvent.create({
            data: {
                eventType: "USER_REGISTERED",
                aggregateType: "User",
                aggregateId: user.id,
                payload: {
                    userId: user.id,
                    email: user.email,
                    customerName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Customer",
                    otpCode: registerOtp,
                    appName: process.env.APP_NAME || "MEEO",
                    subject: `Your Verification Code - ${process.env.APP_NAME || "MEEO"}`,
                    html: emailContent.html,
                    body: emailContent.text,
                },
                status: "PENDING",
            },
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
     * Validates password reset OTP without clearing the Redis key,
     * allowing the client to verify the code before prompting for a new password.
     */
    async verifyResetOtp({ email, otp }: AuthOtpVerification) {
        await this.assertOtp(Keys.PASSWORD_RESET_OTP(email), otp);
        return { verified: true };
    }

    /**
     * Resends OTP for unverified user email and dispatches email.
     */
    async resendOtp({ email }: ResendOtpInput) {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, emailVerified: true, firstName: true, lastName: true },
        });

        if (!user) {
            throw new AppError("No account found with this email", 404);
        }

        if (user.emailVerified) {
            throw new AppError("Email is already verified. Please log in.", 400);
        }

        const tempOtp = await this.createOtp(Keys.USER_OTP(email));

        const emailContent = generateOtpEmail({
            firstName: user.firstName ?? "Valued",
            lastName: user.lastName ?? "Customer",
            otpCode: tempOtp,
            appName: process.env.APP_NAME || "MEEO",
        });

        // Stage transactional outbox event for background email dispatch
        await prisma.outboxEvent.create({
            data: {
                eventType: "USER_OTP_REQUESTED",
                aggregateType: "User",
                aggregateId: user.id,
                payload: {
                    userId: user.id,
                    email: user.email,
                    customerName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Customer",
                    otpCode: tempOtp,
                    appName: process.env.APP_NAME || "MEEO",
                    subject: `Your New Verification Code - ${process.env.APP_NAME || "MEEO"}`,
                    html: emailContent.html,
                    body: emailContent.text,
                },
                status: "PENDING",
            },
        });

        return { tempOtp };
    }

    /**
     * Generates a password reset OTP and dispatches email.
     */
    async forgotPassword({ email }: ForgotPasswordInput) {
        console.log(`[ForgotPassword] 📥 Received request for email: "${email}"`);

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, firstName: true, lastName: true },
        });

        if (!user) {
            console.warn(`[ForgotPassword] ⚠️ User with email "${email}" NOT FOUND in database.`);
            throw new AppError("No account found with this email", 404);
        }

        const tempOtp = await this.createOtp(Keys.PASSWORD_RESET_OTP(email));
        console.log(`[ForgotPassword] ✅ User found (ID: ${user.id}). Generated OTP. Staging outbox event...`);

        const emailContent = generateOtpEmail({
            firstName: user.firstName ?? "Valued",
            lastName: user.lastName ?? "Customer",
            otpCode: tempOtp,
            appName: process.env.APP_NAME || "MEEO",
        });

        // Stage transactional outbox event for background email dispatch
        await prisma.outboxEvent.create({
            data: {
                eventType: "USER_OTP_REQUESTED",
                aggregateType: "User",
                aggregateId: user.id,
                payload: {
                    userId: user.id,
                    email: user.email,
                    customerName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Customer",
                    otpCode: tempOtp,
                    appName: process.env.APP_NAME || "MEEO",
                    subject: `Password Reset Verification Code - ${process.env.APP_NAME || "MEEO"}`,
                    html: emailContent.html,
                    body: emailContent.text,
                },
                status: "PENDING",
            },
        });

        return { tempOtp };
    }

    /**
     * Validates OTP and updates password, invalidating existing sessions and triggering security notifications.
     */
    async resetPassword({ email, otp, password }: ResetPasswordInput) {
        await this.assertOtp(Keys.PASSWORD_RESET_OTP(email), otp);
        const passwordHash = await argon2.hash(password);

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, firstName: true, lastName: true, email: true },
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

        // Dispatch security notification to customer via push and email
        const targetEmail = user.email || email;
        const customerName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Valued Customer";
        await notificationDeliveryService.sendNotificationForEvent(
            "ACCOUNT_PASSWORD_CHANGED",
            { userId: user.id, email: targetEmail, customerName },
            { email: targetEmail, customerName },
        ).catch((err) => {
            console.error(`[AuthRegistration] Failed to send password changed notification:`, err.message);
        });

        return { reset: true };
    }
}

export const authRegistrationService = new AuthRegistrationService();
