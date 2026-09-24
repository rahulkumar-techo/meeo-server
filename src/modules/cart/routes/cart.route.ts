import type { FastifyInstance } from "fastify";
import { cartController } from "../controller/cart.controller.js";
import { cartSwaggerSchemas } from "@/common/docs/cartDocs.js";

/**
 * Registers Shopping Cart routes under /api/v1/cart.
 * All cart endpoints strictly require authentication.
 */
export default async function cartRouter(app: FastifyInstance) {
    app.get(
        "/",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[User] Get active shopping cart",
                description: "Retrieves the current shopping cart for the authenticated user with calculated item totals, cart subtotal, and stock availability alerts.",
                security: [{ bearerAuth: [] }],
            },
        },
        cartController.getCart.bind(cartController),
    );

    app.post(
        "/items",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[User] Add item to cart",
                description: "Adds a product variant to the user's cart with inventory stock validation. If already present, increments quantity up to available stock.",
                security: [{ bearerAuth: [] }],
                body: cartSwaggerSchemas.addItem,
            },
        },
        cartController.addItem.bind(cartController),
    );

    app.patch(
        "/items/:itemId",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[User] Update item quantity in cart",
                description: "Updates the quantity of a specific cart item. Setting quantity to 0 removes the item from the cart. Validates available inventory.",
                security: [{ bearerAuth: [] }],
                params: cartSwaggerSchemas.itemParam,
                body: cartSwaggerSchemas.updateItem,
            },
        },
        cartController.updateItem.bind(cartController),
    );

    app.delete(
        "/items/:itemId",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[User] Remove item from cart",
                description: "Removes a specific product item from the current user's cart.",
                security: [{ bearerAuth: [] }],
                params: cartSwaggerSchemas.itemParam,
            },
        },
        cartController.removeItem.bind(cartController),
    );

    app.delete(
        "/",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Cart - Shopping Bag"],
                summary: "[User] Clear shopping cart",
                description: "Removes all items from the current user's shopping cart.",
                security: [{ bearerAuth: [] }],
            },
        },
        cartController.clearCart.bind(cartController),
    );
}
