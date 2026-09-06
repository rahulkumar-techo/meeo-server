import type { FastifyInstance } from "fastify";
import { cartController } from "../controller/cart.controller.js";
import { cartSwaggerSchemas } from "@/common/docs/cartDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Shopping Cart routes under /api/cart.
 */
export default async function cartRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Active Cart Operations (Guest & User)
    // ----------------------------------------------------
    app.get(
        "/",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[Guest / User] Get active shopping cart",
                description: "Retrieves the current shopping cart for an authenticated user or guest (via `x-session-id` header). Returns calculated item totals, cart subtotal, and stock availability alerts.",
                headers: {
                    type: "object",
                    properties: {
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        cartController.getCart.bind(cartController),
    );

    app.post(
        "/items",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[Guest / User] Add item to cart",
                description: "Adds a product variant to the cart with inventory stock validation. If already present, increments quantity up to available stock.",
                body: cartSwaggerSchemas.addItem,
                headers: {
                    type: "object",
                    properties: {
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        cartController.addItem.bind(cartController),
    );

    app.patch(
        "/items/:itemId",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[Guest / User] Update item quantity in cart",
                description: "Updates the quantity of a specific cart item. Setting quantity to 0 removes the item from the cart. Validates available inventory.",
                params: cartSwaggerSchemas.itemParam,
                body: cartSwaggerSchemas.updateItem,
                headers: {
                    type: "object",
                    properties: {
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        cartController.updateItem.bind(cartController),
    );

    app.delete(
        "/items/:itemId",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[Guest / User] Remove item from cart",
                description: "Removes a specific product item from the current cart.",
                params: cartSwaggerSchemas.itemParam,
                headers: {
                    type: "object",
                    properties: {
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        cartController.removeItem.bind(cartController),
    );

    app.delete(
        "/",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[Guest / User] Clear shopping cart",
                description: "Removes all items from the current shopping cart.",
                headers: {
                    type: "object",
                    properties: {
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        cartController.clearCart.bind(cartController),
    );

    // ----------------------------------------------------
    // User Cart Merge Operations
    // ----------------------------------------------------
    app.post(
        "/merge",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[User] Merge guest cart after login",
                description: "Merges a guest cart identified by `sessionId` into the logged-in user's permanent cart, combining quantities and cleaning up the guest cart.",
                security: [{ bearerAuth: [] }],
                body: cartSwaggerSchemas.mergeCart,
            },
        },
        cartController.mergeCart.bind(cartController),
    );

    // ----------------------------------------------------
    // Maintenance / System
    // ----------------------------------------------------
    app.post(
        "/cleanup",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[Admin: system:manage] Clean up expired guest carts",
                description: "Deletes all guest shopping carts whose expiration date has elapsed.",
                security: [{ bearerAuth: [] }],
            },
        },
        cartController.cleanupExpired.bind(cartController),
    );
}
