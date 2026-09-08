import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { UserProfilePayload } from "../user.validation.js";

/**
 * Service managing user personal profile information (name, avatar, basic details).
 */
export class UserProfileService {
    /**
     * Updates first and last name for an authenticated user.
     *
     * @param userId - Unique UUID of the authenticated user
     * @param payload - First name and last name payload
     * @returns Updated first and last name object
     */
    async updateProfile(userId: string, payload: UserProfilePayload) {
        const { firstName, lastName } = payload;

        const user = await prisma.user.update({
            where: { id: userId },
            data: { firstName, lastName },
            select: {
                firstName: true,
                lastName: true,
            },
        });

        if (!user) {
            throw new AppError("Failed to update profile", 403);
        }

        return {
            firstName: user.firstName,
            lastName: user.lastName,
        };
    }
}

export const userProfileService = new UserProfileService();
