import { prisma } from "@/lib/prisma.js";
import type {
    PhoneOtpRequestPayload,
    PhoneVerificationPayload,
    UserAddressPayload,
    UserProfilePayload,
    AdminUserUpdatePayload,
} from "../user.validation.js";
import { AppError } from "@/common/errors/app-error.js";
import { generateOtp } from "@/common/utils/generateOtp.js";
import redis from "@/lib/redis.js";
import { Keys } from "@/const/keys.js";

const PHONE_OTP_EXPIRY_SECONDS = 60 * 5;

class UserService {

    async listUsers() {
        return prisma.user.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                emailVerified: true,
                phoneVerified: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                roles: { select: { role: { select: { id: true, name: true } } } },
            },
        });
    }

    async updateUser(userId: string, payload: AdminUserUpdatePayload) {
        const data = {
            ...(payload.firstName === undefined ? {} : { firstName: payload.firstName }),
            ...(payload.lastName === undefined ? {} : { lastName: payload.lastName }),
            ...(payload.status === undefined ? {} : { status: payload.status }),
        };

        const user = await prisma.user.updateMany({
            where: { id: userId, deletedAt: null },
            data,
        });

        if (user.count !== 1) throw new AppError("User not found", 404);

        if (payload.status === "SUSPENDED" || payload.status === "BLOCKED") {
            await prisma.userSession.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }

        return prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                emailVerified: true,
                phoneVerified: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    /// validate a phone verification OTP
    private async assertPhoneOtp(userId: string, otp: string) {
        const storedOtp = await redis.get(Keys.PHONE_OTP(userId));

        if (!storedOtp || storedOtp !== otp) {
            throw new AppError("OTP is invalid or expired", 400);
        }
    }

    /// generate and store an OTP for adding or updating a phone number
    async requestPhoneOtp(userId: string, { phone }: PhoneOtpRequestPayload) {
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

        // Future SMS delivery:
        // await smsService.sendOtp(phone, otp);

        return { tempOtp: otp };
    }

    /// verify the phone OTP and save the phone number
    async verifyPhone(userId: string, { phone, otp }: PhoneVerificationPayload) {
        const storedValue = await redis.get(Keys.PHONE_OTP(userId));

        if (!storedValue) {
            throw new AppError("OTP is invalid or expired", 400);
        }

        let storedOtp: { phone: string; otp: string };
        try {
            storedOtp = JSON.parse(storedValue) as { phone: string; otp: string };
        } catch {
            throw new AppError("OTP is invalid or expired", 400);
        }

        if (storedOtp.phone !== phone || storedOtp.otp !== otp) {
            throw new AppError("OTP is invalid or expired", 400);
        }

        await this.assertPhoneOtp(userId, otp);

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

        await redis.del(Keys.PHONE_OTP(userId));
        return user;
    }

    /// update profile 
    async updateProfile(userId: string, payload: UserProfilePayload) {
        const { firstName, lastName } = payload;

        const user = await prisma.user.update({
            where: { id: userId },
            data: { firstName, lastName }
        });

        if (!user)
            throw new AppError("Failed to Update Profile", 403);

        return {
            firstName: user.firstName,
            lastName: user.lastName
        };
    };

    /// create or update an Address 
    async saveAddress(
        isUpdateAddressRequest: boolean,
        userId: string,
        payload: UserAddressPayload,
        addressId?: string // Added: Optional ID needed for updates
    ) {
        const { recipientName, addressLine1, city, state, postalCode, country, addressLine2 } = payload;
        let address;

        // Shared data structure for clean reuse
        const addressData = {
            recipientName,
            addressLine1,
            city,
            state,
            postalCode,
            country,
            addressLine2: addressLine2 ?? null,
        };

        // Shared select structure to ensure consistent API responses
        const selectFields = {
            id: true,
            recipientName: true,
            addressLine1: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            addressLine2: true,
        };

        if (isUpdateAddressRequest) {
            if (!addressId) {
                throw new AppError("Address ID is required for updates", 400);
            }

            address = await prisma.address.update({
                where: {
                    id: addressId,
                    userId: userId // Security check: Ensure the address belongs to the requesting user
                },
                data: addressData,
                select: selectFields
            });
        } else {
            address = await prisma.address.create({
                data: {
                    ...addressData,
                    user: {
                        connect: { id: userId }
                    }
                },
                select: selectFields
            });
        }

        if (!address)
            throw new AppError("Failed to process Address request", 403);

        return address;
    };

    /// delete an Address safely
    async deleteAddress(userId: string, addressId: string) {
        if (!addressId) {
            throw new AppError("Address ID is required", 400);
        }

        const deleteResult = await prisma.address.delete({
            where: {
                id: addressId,
                userId: userId // Security check: prevents unauthorized deletions
            }
        });


        if (!deleteResult) {
            throw new AppError("Address not found or unauthorized to delete", 404);
        }

        return { success: true, message: "Address deleted successfully" };
    }




}

export default new UserService();

