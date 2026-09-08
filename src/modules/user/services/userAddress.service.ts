import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { UserAddressPayload } from "../user.validation.js";

/**
 * Service managing user shipping and billing addresses with ownership validation and XSS protection.
 */
export class UserAddressService {
    /**
     * Reusable select fields for address queries to maintain consistent output structures.
     */
    private readonly selectFields = {
        id: true,
        recipientName: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
    };

    /**
     * Creates a new address or updates an existing address owned by the requesting user.
     *
     * @param isUpdate - True if updating an existing record, False if creating new
     * @param userId - Unique UUID of the authenticated user
     * @param payload - Validated and sanitized address fields
     * @param addressId - Optional address UUID required when isUpdate is true
     * @returns The created or updated address entity
     */
    async saveAddress(
        isUpdate: boolean,
        userId: string,
        payload: UserAddressPayload,
        addressId?: string,
    ) {
        const { recipientName, addressLine1, addressLine2, city, state, postalCode, country } = payload;

        const addressData = {
            recipientName,
            addressLine1,
            city,
            state,
            postalCode,
            country,
            addressLine2: addressLine2 ?? null,
        };

        let address;

        if (isUpdate) {
            if (!addressId) {
                throw new AppError("Address ID is required for updates", 400);
            }

            // Security check: Compound query ensures user can only modify their own addresses (anti-IDOR)
            address = await prisma.address.update({
                where: {
                    id: addressId,
                    userId,
                },
                data: addressData,
                select: this.selectFields,
            });
        } else {
            address = await prisma.address.create({
                data: {
                    ...addressData,
                    user: {
                        connect: { id: userId },
                    },
                },
                select: this.selectFields,
            });
        }

        if (!address) {
            throw new AppError("Failed to process address request", 403);
        }

        return address;
    }

    /**
     * Safely deletes an address owned by the requesting user.
     *
     * @param userId - Unique UUID of the authenticated user
     * @param addressId - Unique UUID of the address to delete
     * @returns Success confirmation message
     */
    async deleteAddress(userId: string, addressId: string) {
        if (!addressId) {
            throw new AppError("Address ID is required", 400);
        }

        // Security check: userId filter prevents cross-account unauthorized deletions
        const deleteResult = await prisma.address.delete({
            where: {
                id: addressId,
                userId,
            },
        });

        if (!deleteResult) {
            throw new AppError("Address not found or unauthorized to delete", 404);
        }

        return { success: true, message: "Address deleted successfully" };
    }
}

export const userAddressService = new UserAddressService();
