import type { FastifyInstance } from "fastify";
import categoryRouter from "./category.route.js";
import brandRouter from "./brand.route.js";
import productRouter from "./product.route.js";
import productVariantRouter, { nestedProductVariantRouter } from "./productVariant.route.js";

/**
 * Registers all catalog-related sub-routers:
 * - /categories -> categoryRouter
 * - /brands -> brandRouter
 * - /products -> productRouter & nestedProductVariantRouter
 * - /variants -> productVariantRouter
 */
export async function catalogRouter(app: FastifyInstance) {
    await app.register(categoryRouter, { prefix: "/categories" });
    await app.register(brandRouter, { prefix: "/brands" });
    await app.register(productRouter, { prefix: "/products" });
    await app.register(nestedProductVariantRouter, { prefix: "/products" });
    await app.register(productVariantRouter, { prefix: "/variants" });
}

export default catalogRouter;

