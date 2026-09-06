import type { FastifyInstance } from "fastify";
import { couponController } from "../controller/coupon.controller.js";
import { couponSwaggerSchemas } from "@/common/docs/couponDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Coupons & Promotions routes under /api/coupons.
 */
export default async function couponRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Customer Endpoints
    // ----------------------------------------------------
    app.post(
        "/validate",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Public / User] Preview coupon discount calculation",
                description: "Validates coupon code, verifies date validity and minimum order thresholds, and calculates the exact discount amount and free shipping benefits for a given subtotal.",
                body: couponSwaggerSchemas.validateCoupon,
            },
        },
        couponController.validateCoupon.bind(couponController),
    );

    app.get(
        "/my-history",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Authenticated User] My coupon redemption history",
                description: "Retrieves list of all promotional coupons previously applied by the authenticated user across their orders.",
                security: [{ bearerAuth: [] }],
            },
        },
        couponController.getMyHistory.bind(couponController),
    );

    // ----------------------------------------------------
    // Admin Coupon Management
    // ----------------------------------------------------
    app.get(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_READ),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:read] List promotional coupons",
                description: "Lists coupons with search by code, type filter, status filter, and pagination.",
                security: [{ bearerAuth: [] }],
                querystring: couponSwaggerSchemas.couponQuery,
            },
        },
        couponController.listCoupons.bind(couponController),
    );

    app.get(
        "/metrics",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_READ),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:read] Coupon analytics and performance",
                description: "Analytics on total coupons, active/inactive breakdown, total discount dollars granted, and top redeemed coupons.",
                security: [{ bearerAuth: [] }],
            },
        },
        couponController.getMetrics.bind(couponController),
    );

    app.get(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_READ),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:read] Get coupon details",
                description: "Retrieves full configuration details and recent usage statistics for a coupon.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        couponController.getCouponById.bind(couponController),
    );

    app.post(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_CREATE),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:create] Create new coupon",
                description: "Creates a new promotional coupon with discount strategy, minimum order threshold, maximum discount cap, and global/per-user limits.",
                security: [{ bearerAuth: [] }],
                body: couponSwaggerSchemas.createCoupon,
            },
        },
        couponController.createCoupon.bind(couponController),
    );

    app.put(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_UPDATE),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:update] Update existing coupon",
                description: "Updates discount rules, limits, or dates for an existing coupon.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                body: couponSwaggerSchemas.updateCoupon,
            },
        },
        couponController.updateCoupon.bind(couponController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_DELETE),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:delete] Delete or archive coupon",
                description: "Permanently deletes unused coupons or deactivates coupons with existing order usages to preserve audit integrity.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        couponController.deleteCoupon.bind(couponController),
    );

    app.patch(
        "/:id/status",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_UPDATE),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:update] Toggle coupon status",
                description: "Quickly activates, deactivates, or marks a coupon as expired.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                body: couponSwaggerSchemas.toggleStatus,
            },
        },
        couponController.toggleStatus.bind(couponController),
    );

    app.get(
        "/:id/usages",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.COUPON_READ),
            ],
            schema: {
                tags: ["Coupons & Promotions"],
                summary: "[Admin: coupon:read] List coupon redemption audit records",
                description: "Lists all order redemption records for a specific coupon.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                querystring: couponSwaggerSchemas.usageQuery,
            },
        },
        couponController.listCouponUsages.bind(couponController),
    );
}
