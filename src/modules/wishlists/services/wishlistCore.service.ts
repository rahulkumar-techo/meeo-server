import { prisma } from "@/lib/prisma.js";

export class WishlistCoreService {
    /**
     * Resolves or creates a wishlist for an authenticated user.
     */
    async getOrCreateWishlist(userId: string) {
        let wishlist = await prisma.wishlist.findUnique({
            where: { userId },
            include: this.getWishlistInclude(),
        });

        if (!wishlist) {
            wishlist = await prisma.wishlist.create({
                data: { userId },
                include: this.getWishlistInclude(),
            });
        }

        return wishlist;
    }

    /**
     * Retrieves the formatted wishlist for a user.
     */
    async getWishlist(userId: string) {
        const wishlist = await this.getOrCreateWishlist(userId);
        return this.formatWishlist(wishlist);
    }

    /**
     * Common Prisma include specification for wishlists.
     */
    getWishlistInclude() {
        return {
            items: {
                orderBy: { createdAt: "desc" as const },
                include: {
                    product: {
                        include: {
                            images: {
                                orderBy: { sortOrder: "asc" as const },
                                take: 1,
                            },
                            category: { select: { id: true, name: true, slug: true } },
                            brand: { select: { id: true, name: true, slug: true } },
                            variants: {
                                where: { status: "ACTIVE" as const },
                                select: {
                                    id: true,
                                    sku: true,
                                    price: true,
                                    compareAtPrice: true,
                                    inventory: {
                                        select: { availableQuantity: true },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
    }

    /**
     * Formats wishlist data for API responses.
     */
    formatWishlist(wishlist: any) {
        const items = (wishlist.items || []).map((item: any) => {
            const product = item.product;
            const prices = (product.variants || []).map((v: any) => Number(v.price));
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
            const totalInStock = (product.variants || []).reduce(
                (acc: number, v: any) => acc + (v.inventory?.availableQuantity ?? 0),
                0,
            );

            return {
                productId: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description,
                status: product.status,
                isFeatured: product.isFeatured,
                addedAt: item.createdAt,
                thumbnail: product.images?.[0]?.url ?? null,
                category: product.category,
                brand: product.brand,
                pricing: {
                    minPrice,
                    maxPrice,
                    currency: "USD",
                },
                inStock: totalInStock > 0,
                availableVariantsCount: (product.variants || []).length,
                variants: product.variants,
            };
        });

        return {
            id: wishlist.id,
            userId: wishlist.userId,
            itemCount: items.length,
            createdAt: wishlist.createdAt,
            updatedAt: wishlist.updatedAt,
            items,
        };
    }
}

export const wishlistCoreService = new WishlistCoreService();
