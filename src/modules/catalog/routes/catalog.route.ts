import type { FastifyInstance } from "fastify";
import categoryRouter from "./category.route.js";
import brandRouter from "./brand.route.js";
import productRouter from "./product.route.js";

/**
 * Registers all catalog-related sub-routers:
 * - /categories -> categoryRouter
 * - /brands -> brandRouter
 * - /products -> productRouter
 */
export async function catalogRouter(app: FastifyInstance) {
    await app.register(categoryRouter, { prefix: "/categories" });
    await app.register(brandRouter, { prefix: "/brands" });
    await app.register(productRouter, { prefix: "/products" });
}

export default catalogRouter;
