import { prisma } from "@/lib/prisma.js";
import type {
    AuthLoginOption,
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
import { generateAccessToken, generateRefreshToken, hashToken, verifyRefreshToken } from "@/common/utils/token.js";
import crypto from "crypto";

class AuthService {
    private async assertOtp(key: string, otp: string) {
        const storedOtp = await redis.get(key);

        if (!storedOtp || storedOtp !== otp) {
            throw new AppError("OTP is invalid or expired", 400);
        }
    }

    private async createOtp(key: string) {
        const otp = generateOtp(4);
        await redis.set(key, otp, "EX", 60 * 5);
        return otp;
    }

    // Register user through email and password
    async register(payload: AuthRegisterInput) {
        const { firstName, lastName, email, password } = payload;

        

        // Hash password
        const passwordHash = await argon2.hash(password);

        // create a new user
        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                passwordHash,
            },

            // Only return safe fields
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

        // await mailService.sendMail({
        //     to: user.email!,
        //     subject: "Welcome to Hungrilla",
        //     text: "Your account has been created successfully.",
        //     html: generateOtpEmail({ firstName: user?.firstName!, lastName: user?.lastName!, otpCode: registerOtp, appName: "Meeo" }).html
        // });


        return { user, tempOtp: registerOtp };
    };

    async verifyOtp({ email, otp }: AuthOtpVerification) {
        await this.assertOtp(Keys.USER_OTP(email), otp);
        await prisma.user.update({
            where: { email },
            data: { emailVerified: true },
        });
        await redis.del(Keys.USER_OTP(email));

        return { verified: true };
    }

    async resendOtp({ email }: ResendOtpInput) {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { email: true, emailVerified: true },
        });

        if (!user || user.emailVerified) {
            return {};
        }

        const tempOtp = await this.createOtp(Keys.USER_OTP(email));

        // Future email delivery:
        // await mailService.sendMail({ ... });

        return { tempOtp };
    }

    async forgotPassword({ email }: ForgotPasswordInput) {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { email: true },
        });

        if (!user) {
            return {};
        }

        const tempOtp = await this.createOtp(Keys.PASSWORD_RESET_OTP(email));

        // Future email delivery:
        // await mailService.sendMail({ ... });

        return { tempOtp };
    }

    async login(payload: AuthLoginOption) {
        const { email, password } = payload;

        // Find user
        const user = await prisma.user.findUnique({
            where: {
                email,
            },
        });

        // Don't reveal whether the email exists
        if (!user) {
            throw new AppError("Invalid email or password", 401);
        }

        // Compare password
        const isPasswordValid = await argon2.verify(
            user.passwordHash,
            password,
        );

        if (!isPasswordValid) {
            throw new AppError("Invalid email or password", 401);
        }

        // Optional: Check email verification
        if (!user.emailVerified) {
            throw new AppError(
                "Please verify your email before logging in",
                403,
            );
        }

        // Refresh token expiration
        const expiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
        );
        // Create session ID
        const sessionId = crypto.randomUUID();

        // Generate refresh token
        const refreshToken = generateRefreshToken({
            userId: user.id,
            email: user.email!,
            sessionId,
        });

        // Store HASH, never raw token
        await prisma.userSession.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshTokenHash: hashToken(refreshToken),
                expiresAt,
            },
        });

        // Generate access token
        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email!,
            sessionId,
        });

        return {
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
            },

            accessToken,
            refreshToken,
        };
    };

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
    };


    async refreshToken(refreshToken: string) {
        let payload: ReturnType<typeof verifyRefreshToken>;

        try {
            payload = verifyRefreshToken(refreshToken);
        } catch {
            throw new AppError(
                "Invalid or expired refresh token",
                401,
            );
        }

        const tokenHash = hashToken(refreshToken);

        const session = await prisma.userSession.findUnique({
            where: {
                id: payload.sessionId,
            },
        });

        if (!session || session.userId !== payload.userId || session.revokedAt) {
            throw new AppError(
                "Invalid refresh token",
                401,
            );
        }

        if (session.refreshTokenHash !== tokenHash) {
            await prisma.userSession.deleteMany({
                where: {
                    id: session.id,
                },
            });

            throw new AppError(
                "Refresh token is invalid",
                401,
            );
        }

        if (session.expiresAt < new Date()) {
            await prisma.userSession.deleteMany({
                where: {
                    id: session.id,
                },
            });

            throw new AppError(
                "Session expired",
                401,
            );
        }

        const newRefreshToken = generateRefreshToken({
            userId: payload.userId,
            email: payload.email,
            sessionId: session.id,
        });

        const rotation = await prisma.userSession.updateMany({
            where: {
                id: session.id,
                refreshTokenHash: tokenHash,
                revokedAt: null,
            },
            data: {
                refreshTokenHash: hashToken(newRefreshToken),
                lastUsedAt: new Date(),
            },
        });

        if (rotation.count !== 1) {
            throw new AppError("Refresh token is invalid", 401);
        }

        const accessToken = generateAccessToken({
            userId: payload.userId,
            email: payload.email,
        });

        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    };

    async getCurrentUser(userId: string) {
        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                deletedAt: null,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatarUrl: true,
                emailVerified: true,
                phoneVerified: true,
                status: true,
            },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return user;
    };


}

export const authService = new AuthService();