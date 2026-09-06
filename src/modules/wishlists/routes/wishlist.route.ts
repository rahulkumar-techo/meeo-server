import type { FastifyInstance } from "fastify";
import { wishlistController } from "../controller/wishlist.controller.js";
import { wishlistSwaggerSchemas } from "@/common/docs/cartDocs.js";

/**
 * Registers Wishlist routes under /api/wishlist.
 */
export default async function wishlistRouter(app: FastifyInstance) {
    // All Wishlist endpoints require authentication
    app.addHook("preHandler", app.authenticate);

    app.get(
        "/",
        {
            schema: {
                tags: ["Wishlist - Saved Products"],
                summary: "[User] Get user wishlist",
                description: "Retrieves the authenticated user's saved wishlist products with thumbnails, pricing range, and stock availability.",
                security: [{ bearerAuth: [] }],
            },
        },
        wishlistController.getWishlist.bind(wishlistController),
    );

    app.post(
        "/",
        {
            schema: {
                tags: ["Wishlist - Saved Products"],
                summary: "[User] Add product to wishlist",
                description: "Adds a product to the authenticated user's wishlist by product ID in request body.",
                security: [{ bearerAuth: [] }],
                body: wishlistSwaggerSchemas.addProduct,
            },
        },
        wishlistController.addProduct.bind(wishlistController),
    );

    app.post(
        "/products/:productId",
        {
            schema: {
                tags: ["Wishlist - Saved Products"],
                summary: "[User] Add product to wishlist by route param",
                description: "Adds a product to the authenticated user's wishlist using productId route parameter.",
                security: [{ bearerAuth: [] }],
                params: wishlistSwaggerSchemas.productParam,
            },
        },
        wishlistController.addProduct.bind(wishlistController),
    );

    app.delete(
        "/products/:productId",
        {
            schema: {
                tags: ["Wishlist - Saved Products"],
                summary: "[User] Remove product from wishlist",
                description: "Removes a product from the authenticated user's wishlist.",
                security: [{ bearerAuth: [] }],
                params: wishlistSwaggerSchemas.productParam,
            },
        },
        wishlistController.removeProduct.bind(wishlistController),
    );

    app.post(
        "/products/:productId/move-to-cart",
        {
            schema: {
                tags: ["Wishlist - Saved Products"],
                summary: "[User] Move wishlist item to cart",
                description: "Transfers a saved product (or chosen variant) directly into the user's shopping cart and removes it from the wishlist.",
                security: [{ bearerAuth: [] }],
                params: wishlistSwaggerSchemas.productParam,
                body: wishlistSwaggerSchemas.moveToCart,
            },
        },
        wishlistController.moveToCart.bind(wishlistController),
    );
}
