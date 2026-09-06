import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { wishlistService } from "../services/wishlist.service.js";
import {
    addWishlistItemSchema,
    moveToCartSchema,
    wishlistProductParamSchema,
} from "../validations/wishlist.validation.js";

export class WishlistController {
    /**
     * Retrieves the authenticated user's wishlist.
     */
    async getWishlist(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const result = await wishlistService.getWishlist(userId);

        return sendOk({
            reply,
            message: "Wishlist retrieved successfully",
            data: result,
        });
    }

    /**
     * Adds a product to the user's wishlist.
     */
    async addProduct(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        let productId: string;

        if ((request.params as any)?.productId) {
            productId = wishlistProductParamSchema.parse(request.params).productId;
        } else {
            productId = addWishlistItemSchema.parse(request.body).productId;
        }

        const result = await wishlistService.addProduct(userId, productId);

        return sendCreated({
            reply,
            message: "Product added to wishlist successfully",
            data: result,
        });
    }

    /**
     * Removes a product from the user's wishlist.
     */
    async removeProduct(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const { productId } = wishlistProductParamSchema.parse(request.params);
        const result = await wishlistService.removeProduct(userId, productId);

        return sendOk({
            reply,
            message: "Product removed from wishlist successfully",
            data: result,
        });
    }

    /**
     * Moves a product from wishlist to cart.
     */
    async moveToCart(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const { productId } = wishlistProductParamSchema.parse(request.params);
        const input = request.body ? moveToCartSchema.parse(request.body) : undefined;
        const result = await wishlistService.moveToCart(userId, productId, input);

        return sendOk({
            reply,
            message: result.message,
            data: result,
        });
    }
}

export const wishlistController = new WishlistController();
