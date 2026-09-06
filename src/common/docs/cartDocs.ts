/**
 * Fastify Swagger documentation schemas for Cart & Wishlist modules.
 */

export const cartTags = [
    {
        name: "Cart - Shopping Bag",
        description: "🛒 Guest & User Shopping Bag: Add items, update quantities, real-time stock checks, guest-to-user cart merge, and TTL expiration",
    },
    {
        name: "Wishlist - Saved Products",
        description: "💖 Saved Customer Favorites: Add/remove products, browse wishlist, and direct transfer to shopping cart",
    },
];

export const cartSwaggerSchemas = {
    addItem: {
        type: "object",
        required: ["variantId"],
        properties: {
            variantId: {
                type: "string",
                format: "uuid",
                description: "UUID of the product variant to add to cart",
            },
            quantity: {
                type: "integer",
                minimum: 1,
                maximum: 1000,
                default: 1,
                description: "Quantity of the variant to add",
            },
        },
    },

    updateItem: {
        type: "object",
        required: ["quantity"],
        properties: {
            quantity: {
                type: "integer",
                minimum: 0,
                maximum: 1000,
                description: "Updated quantity (set to 0 to remove item)",
            },
        },
    },

    itemParam: {
        type: "object",
        required: ["itemId"],
        properties: {
            itemId: {
                type: "string",
                format: "uuid",
                description: "Cart item UUID",
            },
        },
    },

    mergeCart: {
        type: "object",
        required: ["sessionId"],
        properties: {
            sessionId: {
                type: "string",
                description: "Guest session ID from the x-session-id header",
            },
        },
    },
};

export const wishlistSwaggerSchemas = {
    addProduct: {
        type: "object",
        required: ["productId"],
        properties: {
            productId: {
                type: "string",
                format: "uuid",
                description: "UUID of the product to add to wishlist",
            },
        },
    },

    productParam: {
        type: "object",
        required: ["productId"],
        properties: {
            productId: {
                type: "string",
                format: "uuid",
                description: "Product UUID",
            },
        },
    },

    moveToCart: {
        type: "object",
        properties: {
            variantId: {
                type: "string",
                format: "uuid",
                description: "Optional specific variant ID. If omitted, the first available active variant is used.",
            },
            quantity: {
                type: "integer",
                minimum: 1,
                default: 1,
                description: "Quantity to move to cart",
            },
        },
    },
};
