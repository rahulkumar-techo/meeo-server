import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { cartService } from "../services/cart.service.js";
import {
    addCartItemSchema,
    cartItemParamSchema,
    updateCartItemSchema,
} from "../validations/cart.validation.js";

export class CartController {
    /**
     * Retrieves the current user's cart.
     */
    async getCart(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const result = await cartService.getCart(userId);

        return sendOk({
            reply,
            message: "Cart retrieved successfully",
            data: result,
        });
    }

    /**
     * Adds an item / variant to the user's cart.
     */
    async addItem(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const input = addCartItemSchema.parse(request.body);
        const result = await cartService.addItem(userId, input);

        return sendCreated({
            reply,
            message: "Item added to cart successfully",
            data: result,
        });
    }

    /**
     * Updates an item's quantity in the user's cart.
     */
    async updateItem(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const { itemId } = cartItemParamSchema.parse(request.params);
        const input = updateCartItemSchema.parse(request.body);
        const result = await cartService.updateItemQuantity(userId, itemId, input);

        return sendOk({
            reply,
            message: "Cart item updated successfully",
            data: result,
        });
    }

    /**
     * Removes an item from the user's cart.
     */
    async removeItem(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const { itemId } = cartItemParamSchema.parse(request.params);
        const result = await cartService.removeItem(userId, itemId);

        return sendOk({
            reply,
            message: "Cart item removed successfully",
            data: result,
        });
    }

    /**
     * Clears all items in the user's cart.
     */
    async clearCart(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const result = await cartService.clearCart(userId);

        return sendOk({
            reply,
            message: "Cart cleared successfully",
            data: result,
        });
    }
}

export const cartController = new CartController();
