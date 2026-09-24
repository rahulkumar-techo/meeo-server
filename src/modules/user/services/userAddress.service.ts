import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { UpdateUserAddressPayload, UserAddressPayload } from "../user.validation.js";

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
        phone: true,
        label: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
    };

    /**
     * Retrieves all saved addresses for the requesting user.
     * Sorted with default address first, followed by newest created.
     */
    async getAddresses(userId: string) {
        return prisma.address.findMany({
            where: { userId },
            orderBy: [
                { isDefault: "desc" },
                { createdAt: "desc" },
            ],
            select: this.selectFields,
        });
    }

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
        payload: UserAddressPayload | UpdateUserAddressPayload,
        addressId?: string,
    ) {
        if (isUpdate) {
            if (!addressId) {
                throw new AppError("Address ID is required for updates", 400);
            }

            // If updating to default address, clear default flag from other user addresses
            if (payload.isDefault === true) {
                await prisma.address.updateMany({
                    where: { userId, isDefault: true, id: { not: addressId } },
                    data: { isDefault: false },
                });
            }

            const updateData: Record<string, any> = {};
            if (payload.recipientName !== undefined) updateData.recipientName = payload.recipientName;
            if (payload.phone !== undefined) updateData.phone = payload.phone ?? null;
            if (payload.label !== undefined) updateData.label = payload.label ?? null;
            if (payload.addressLine1 !== undefined) updateData.addressLine1 = payload.addressLine1;
            if (payload.addressLine2 !== undefined) updateData.addressLine2 = payload.addressLine2 ?? null;
            if (payload.city !== undefined) updateData.city = payload.city;
            if (payload.state !== undefined) updateData.state = payload.state;
            if (payload.postalCode !== undefined) updateData.postalCode = payload.postalCode;
            if (payload.country !== undefined) updateData.country = payload.country;
            if (payload.isDefault !== undefined) updateData.isDefault = payload.isDefault;

            // Security check: Compound query ensures user can only modify their own addresses (anti-IDOR)
            const address = await prisma.address.update({
                where: {
                    id: addressId,
                    userId,
                },
                data: updateData,
                select: this.selectFields,
            });

            return address;
        }

        const createPayload = payload as UserAddressPayload;

        // If it's the user's first address, automatically make it default
        const existingCount = await prisma.address.count({ where: { userId } });
        const isDefault = createPayload.isDefault ?? (existingCount === 0);

        if (isDefault && existingCount > 0) {
            await prisma.address.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false },
            });
        }

        const address = await prisma.address.create({
            data: {
                recipientName: createPayload.recipientName,
                phone: createPayload.phone ?? null,
                label: createPayload.label ?? null,
                addressLine1: createPayload.addressLine1,
                addressLine2: createPayload.addressLine2 ?? null,
                city: createPayload.city,
                state: createPayload.state,
                postalCode: createPayload.postalCode,
                country: createPayload.country,
                isDefault,
                user: {
                    connect: { id: userId },
                },
            },
            select: this.selectFields,
        });

        return address;
    }

    /**
     * Safely deletes an address owned by the requesting user.
     * If the deleted address was default, marks the newest remaining address as default.
     *
     * @param userId - Unique UUID of the authenticated user
     * @param addressId - Unique UUID of the address to delete
     * @returns Success confirmation message
     */
    async deleteAddress(userId: string, addressId: string) {
        if (!addressId) {
            throw new AppError("Address ID is required", 400);
        }

        const address = await prisma.address.findFirst({
            where: {
                id: addressId,
                userId,
            },
        });

        if (!address) {
            throw new AppError("Address not found or unauthorized to delete", 404);
        }

        await prisma.address.delete({
            where: {
                id: addressId,
                userId,
            },
        });

        // If default address was deleted, promote the newest remaining address as default
        if (address.isDefault) {
            const nextAddress = await prisma.address.findFirst({
                where: { userId },
                orderBy: { createdAt: "desc" },
            });

            if (nextAddress) {
                await prisma.address.update({
                    where: { id: nextAddress.id },
                    data: { isDefault: true },
                });
            }
        }

        return { success: true, message: "Address deleted successfully" };
    }
}

export const userAddressService = new UserAddressService();
