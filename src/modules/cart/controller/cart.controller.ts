import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { cartService, type CartIdentity } from "../services/cart.service.js";
import {
    addCartItemSchema,
    cartItemParamSchema,
    mergeCartSchema,
    updateCartItemSchema,
} from "../validations/cart.validation.js";
import { AppError } from "@/common/errors/app-error.js";

export class CartController {
    /**
     * Extracts user ID (if logged in) or guest session ID from request headers/cookies.
     */
    private extractIdentity(request: FastifyRequest): CartIdentity {
        const userId = request.user?.id;
        const sessionId = (request.headers["x-session-id"] as string | undefined) ||
            (request.headers["session-id"] as string | undefined);

        return { userId, sessionId };
    }

    /**
     * Attaches session ID header to reply if guest.
     */
    private attachSessionHeader(reply: FastifyReply, sessionId?: string) {
        if (sessionId) {
            reply.header("x-session-id", sessionId);
        }
    }

    /**
     * Retrieves the current cart.
     */
    async getCart(request: FastifyRequest, reply: FastifyReply) {
        const identity = this.extractIdentity(request);
        const result = await cartService.getCart(identity);

        this.attachSessionHeader(reply, result.sessionId);

        return sendOk({
            reply,
            message: "Cart retrieved successfully",
            data: result,
        });
    }

    /**
     * Adds an item / variant to the cart.
     */
    async addItem(request: FastifyRequest, reply: FastifyReply) {
        const identity = this.extractIdentity(request);
        const input = addCartItemSchema.parse(request.body);
        const result = await cartService.addItem(identity, input);

        this.attachSessionHeader(reply, result.sessionId);

        return sendCreated({
            reply,
            message: "Item added to cart successfully",
            data: result,
        });
    }

    /**
     * Updates an item's quantity in the cart.
     */
    async updateItem(request: FastifyRequest, reply: FastifyReply) {
        const identity = this.extractIdentity(request);
        const { itemId } = cartItemParamSchema.parse(request.params);
        const input = updateCartItemSchema.parse(request.body);
        const result = await cartService.updateItemQuantity(identity, itemId, input);

        this.attachSessionHeader(reply, result.sessionId);

        return sendOk({
            reply,
            message: "Cart item updated successfully",
            data: result,
        });
    }

    /**
     * Removes an item from the cart.
     */
    async removeItem(request: FastifyRequest, reply: FastifyReply) {
        const identity = this.extractIdentity(request);
        const { itemId } = cartItemParamSchema.parse(request.params);
        const result = await cartService.removeItem(identity, itemId);

        this.attachSessionHeader(reply, result.sessionId);

        return sendOk({
            reply,
            message: "Cart item removed successfully",
            data: result,
        });
    }

    /**
     * Clears all items in the cart.
     */
    async clearCart(request: FastifyRequest, reply: FastifyReply) {
        const identity = this.extractIdentity(request);
        const result = await cartService.clearCart(identity);

        this.attachSessionHeader(reply, result.sessionId);

        return sendOk({
            reply,
            message: "Cart cleared successfully",
            data: result,
        });
    }

    /**
     * Merges a guest cart into the logged-in user's cart.
     */
    async mergeCart(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        if (!userId) {
            throw new AppError("Authentication required to merge cart", 401);
        }

        const input = mergeCartSchema.parse(request.body);
        const result = await cartService.mergeGuestCart(userId, input.sessionId);

        return sendOk({
            reply,
            message: "Guest cart merged into user cart successfully",
            data: result,
        });
    }

    /**
     * Cleans up expired guest carts.
     */
    async cleanupExpired(request: FastifyRequest, reply: FastifyReply) {
        const result = await cartService.cleanupExpiredCarts();

        return sendOk({
            reply,
            message: "Expired carts cleaned up successfully",
            data: result,
        });
    }
}

export const cartController = new CartController();
