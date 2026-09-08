import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { generateOtp } from "@/common/utils/generateOtp.js";
import redis from "@/lib/redis.js";
import { Keys } from "@/const/keys.js";
import type {
    PhoneOtpRequestPayload,
    PhoneVerificationPayload,
} from "../user.validation.js";

const PHONE_OTP_EXPIRY_SECONDS = 60 * 5; // 5 minutes TTL

/**
 * Service managing telephone verification, unique phone number assignment, and Redis OTP lifecycle.
 */
export class UserPhoneService {
    /**
     * Validates that the provided OTP matches the stored value in Redis for the user.
     *
     * @param userId - Unique UUID of the user
     * @param otp - 4-digit code provided by the client
     */
    private async assertPhoneOtp(userId: string, otp: string) {
        const storedValue = await redis.get(Keys.PHONE_OTP(userId));

        if (!storedValue) {
            throw new AppError("OTP is invalid or expired", 400);
        }

        let parsed: { phone: string; otp: string };
        try {
            parsed = JSON.parse(storedValue) as { phone: string; otp: string };
        } catch {
            throw new AppError("OTP is invalid or expired", 400);
        }

        if (parsed.otp !== otp) {
            throw new AppError("OTP is invalid or expired", 400);
        }

        return parsed;
    }

    /**
     * Requests an OTP for phone verification.
     * Enforces that the phone number is not already bound to another customer account.
     *
     * @param userId - Unique UUID of the user
     * @param payload - Phone number in E.164 format
     * @returns Temporary OTP (in production, dispatched via SMS provider)
     */
    async requestPhoneOtp(userId: string, { phone }: PhoneOtpRequestPayload) {
        // Enforce uniqueness across all other user accounts
        const existingPhone = await prisma.user.findFirst({
            where: {
                phone,
                id: { not: userId },
            },
            select: { id: true },
        });

        if (existingPhone) {
            throw new AppError("Phone number is already in use", 409);
        }

        const otp = generateOtp(4);
        await redis.set(
            Keys.PHONE_OTP(userId),
            JSON.stringify({ phone, otp }),
            "EX",
            PHONE_OTP_EXPIRY_SECONDS,
        );

        // In production, integrate with SMS transport (e.g. Twilio, AWS SNS):
        // await smsService.sendOtp(phone, otp);

        return { tempOtp: otp };
    }

    /**
     * Verifies the submitted OTP against Redis, updates the user's phone, and sets phoneVerified to true.
     *
     * @param userId - Unique UUID of the user
     * @param payload - Phone number and 4-digit verification OTP
     * @returns Updated phone and verification status
     */
    async verifyPhone(userId: string, { phone, otp }: PhoneVerificationPayload) {
        const stored = await this.assertPhoneOtp(userId, otp);

        if (stored.phone !== phone) {
            throw new AppError("OTP was requested for a different phone number", 400);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                phone,
                phoneVerified: true,
            },
            select: {
                phone: true,
                phoneVerified: true,
            },
        });

        // Invalidate Redis OTP after successful verification to prevent replay attacks
        await redis.del(Keys.PHONE_OTP(userId));

        return user;
    }
}

export const userPhoneService = new UserPhoneService();
