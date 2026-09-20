import type { FastifyInstance } from "fastify";
import { promotionController } from "../controller/promotion.controller.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Promotions routes under /api/v1/promotions.
 */
export default async function promotionRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public & Customer Endpoints
    // ----------------------------------------------------
    app.post(
        "/preview",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Promotions"],
                summary: "[Public / User] Preview and calculate promotions on cart items",
                description: "Evaluates automatic campaigns and promo codes against cart items and returns server-calculated discounts and allocations.",
            },
        },
        promotionController.previewCart.bind(promotionController)
    );

    app.post(
        "/validate-code",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Promotions"],
                summary: "[Public / User] Validate a specific promo code",
                description: "Verifies if a promo code is active, within schedule, and meets minimum order requirements.",
            },
        },
        promotionController.validateCode.bind(promotionController)
    );

    app.get(
        "/active",
        {
            schema: {
                tags: ["Promotions"],
                summary: "[Public] Get active promotion banners and campaigns",
                description: "Lists currently active public promotions for storefront banners and hero highlights.",
            },
        },
        promotionController.getActivePromotions.bind(promotionController)
    );

    app.get(
        "/my-history",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Promotions"],
                summary: "[Customer] View my promotion redemption history",
                description: "Retrieves all promotion applications recorded for the authenticated user.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.getMyHistory.bind(promotionController)
    );

    // ----------------------------------------------------
    // Admin Promotion Management
    // ----------------------------------------------------
    app.get(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_READ),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] List all promotions",
                description: "Lists promotions with search, type, status, and pagination filters.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.listPromotions.bind(promotionController)
    );

    app.get(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_READ),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Get promotion by ID with usage statistics",
                description: "Retrieves complete promotion definition along with redemption stats and recent orders.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.getPromotionById.bind(promotionController)
    );

    app.post(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_CREATE),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Create a new promotion campaign",
                description: "Creates a draft, scheduled, or active promotional rule with full targeting.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.createPromotion.bind(promotionController)
    );

    app.put(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_UPDATE),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Update existing promotion",
                description: "Updates promotion parameters, targeting, or values with audit logging.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.updatePromotion.bind(promotionController)
    );

    app.patch(
        "/:id/publish",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_UPDATE),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Publish promotion to ACTIVE state",
                description: "Transitions a draft or scheduled promotion into active status.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.publishPromotion.bind(promotionController)
    );

    app.patch(
        "/:id/pause",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_UPDATE),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Pause an active promotion",
                description: "Temporarily deactivates an active campaign from being applied.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.pausePromotion.bind(promotionController)
    );

    app.patch(
        "/:id/archive",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_DELETE),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Archive a promotion",
                description: "Permanently archives a promotion, disabling all future redemptions.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.archivePromotion.bind(promotionController)
    );

    app.patch(
        "/:id/status",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PROMOTION_UPDATE),
            ],
            schema: {
                tags: ["Promotions"],
                summary: "[Admin] Toggle promotion status",
                description: "Directly sets the status of a promotion.",
                security: [{ bearerAuth: [] }],
            },
        },
        promotionController.toggleStatus.bind(promotionController)
    );
}
