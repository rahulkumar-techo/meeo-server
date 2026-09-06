import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { wishlistCoreService } from "./wishlistCore.service.js";

export class WishlistItemService {
    /**
     * Adds a product to the user's wishlist (idempotent).
     */
    async addProduct(userId: string, productId: string) {
        const wishlist = await wishlistCoreService.getOrCreateWishlist(userId);

        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { variants: true },
        });

        if (!product || product.status !== "ACTIVE" || product.deletedAt) {
            throw new AppError("Product not found or is inactive", 404);
        }

        const existingItem = await prisma.wishlistItem.findUnique({
            where: {
                wishlistId_productId: {
                    wishlistId: wishlist.id,
                    productId,
                },
            },
        });

        if (!existingItem) {
            await prisma.wishlistItem.create({
                data: {
                    wishlistId: wishlist.id,
                    productId,
                },
            });
        }

        const updatedWishlist = await prisma.wishlist.findUnique({
            where: { id: wishlist.id },
            include: wishlistCoreService.getWishlistInclude(),
        });

        return wishlistCoreService.formatWishlist(updatedWishlist!);
    }

    /**
     * Removes a product from the user's wishlist.
     */
    async removeProduct(userId: string, productId: string) {
        const wishlist = await wishlistCoreService.getOrCreateWishlist(userId);

        const existingItem = await prisma.wishlistItem.findUnique({
            where: {
                wishlistId_productId: {
                    wishlistId: wishlist.id,
                    productId,
                },
            },
        });

        if (!existingItem) {
            throw new AppError("Product not found in your wishlist", 404);
        }

        await prisma.wishlistItem.delete({
            where: {
                wishlistId_productId: {
                    wishlistId: wishlist.id,
                    productId,
                },
            },
        });

        const updatedWishlist = await prisma.wishlist.findUnique({
            where: { id: wishlist.id },
            include: wishlistCoreService.getWishlistInclude(),
        });

        return wishlistCoreService.formatWishlist(updatedWishlist!);
    }
}

export const wishlistItemService = new WishlistItemService();
