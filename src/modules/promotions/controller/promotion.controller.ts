import type { FastifyRequest, FastifyReply } from "fastify";
import { promotionService } from "../services/promotion.service.js";
import { promotionUsageService } from "../services/promotionUsage.service.js";
import {
    createPromotionSchema,
    updatePromotionSchema,
    promotionQuerySchema,
    previewPromotionSchema,
    validatePromoCodeSchema,
    togglePromotionStatusSchema,
} from "../validations/promotion.validation.js";

export class PromotionController {
    /**
     * Admin: Create a new promotion campaign.
     */
    async createPromotion(req: FastifyRequest, reply: FastifyReply) {
        const body = createPromotionSchema.parse(req.body);
        const result = await promotionService.createPromotion(body, req.user?.id);
        return reply.status(201).send({
            status: "success",
            message: `Promotion "${result.name}" created successfully`,
            data: result,
        });
    }

    /**
     * Admin: Update an existing promotion.
     */
    async updatePromotion(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const body = updatePromotionSchema.parse(req.body);
        const result = await promotionService.updatePromotion(id, body, req.user?.id);
        return reply.status(200).send({
            status: "success",
            message: `Promotion "${result.name}" updated successfully`,
            data: result,
        });
    }

    /**
     * Admin: Retrieve promotion details and stats by ID.
     */
    async getPromotionById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await promotionService.getPromotionById(id);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: List all promotions with search, type, and pagination filters.
     */
    async listPromotions(req: FastifyRequest, reply: FastifyReply) {
        const query = promotionQuerySchema.parse(req.query);
        const result = await promotionService.listPromotions(query);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Publish promotion to ACTIVE state.
     */
    async publishPromotion(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await promotionService.updateStatus(id, "ACTIVE", req.user?.id);
        return reply.status(200).send({
            status: "success",
            message: `Promotion "${result.name}" published to ACTIVE status`,
            data: result,
        });
    }

    /**
     * Admin: Pause an active promotion.
     */
    async pausePromotion(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await promotionService.updateStatus(id, "PAUSED", req.user?.id);
        return reply.status(200).send({
            status: "success",
            message: `Promotion "${result.name}" status changed to PAUSED`,
            data: result,
        });
    }

    /**
     * Admin: Archive a promotion.
     */
    async archivePromotion(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await promotionService.updateStatus(id, "ARCHIVED", req.user?.id);
        return reply.status(200).send({
            status: "success",
            message: `Promotion "${result.name}" archived successfully`,
            data: result,
        });
    }

    /**
     * Admin: Toggle arbitrary promotion status.
     */
    async toggleStatus(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const { status } = togglePromotionStatusSchema.parse(req.body);
        const result = await promotionService.updateStatus(id, status, req.user?.id);
        return reply.status(200).send({
            status: "success",
            message: `Promotion status set to ${status}`,
            data: result,
        });
    }

    /**
     * Admin & Storefront: Preview server-side promotion evaluation for given cart items.
     */
    async previewCart(req: FastifyRequest, reply: FastifyReply) {
        const body = previewPromotionSchema.parse(req.body);
        const result = await promotionService.previewCart(body, req.user?.id);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Storefront: Customer validates a specific promo code.
     */
    async validateCode(req: FastifyRequest, reply: FastifyReply) {
        const body = validatePromoCodeSchema.parse(req.body);
        const result = await promotionService.validatePromoCode(body.code, body.subtotal, req.user?.id);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Storefront: Customer views their own promotion redemption history.
     */
    async getMyHistory(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const query = req.query as { page?: number; limit?: number };
        const result = await promotionUsageService.getUserPromotionHistory(userId, query);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Storefront: Public banners and active automatic promotions.
     */
    async getActivePromotions(_req: FastifyRequest, reply: FastifyReply) {
        const result = await promotionService.resolveCandidatePromotions(null);
        const publicList = result.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            type: p.type,
            discountValue: p.discountValue,
            isAutomatic: p.isAutomatic,
            startsAt: p.startsAt,
            endsAt: p.endsAt,
        }));
        return reply.status(200).send({
            status: "success",
            data: publicList,
        });
    }
}

export const promotionController = new PromotionController();
