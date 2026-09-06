import type { FastifyRequest, FastifyReply } from "fastify";
import { couponService } from "../services/coupon.service.js";
import { couponCalculationService } from "../services/couponCalculation.service.js";
import { couponUsageService } from "../services/couponUsage.service.js";
import { couponMetricsService } from "../services/couponMetrics.service.js";
import {
    createCouponSchema,
    updateCouponSchema,
    validateCouponSchema,
    couponQuerySchema,
    couponUsageQuerySchema,
    toggleCouponStatusSchema,
} from "../validations/coupon.validation.js";

export class CouponController {
    /**
     * Customer preview & validation of a coupon code for their order subtotal.
     */
    async validateCoupon(req: FastifyRequest, reply: FastifyReply) {
        const body = validateCouponSchema.parse(req.body);
        const userId = req.user?.id;
        const result = await couponCalculationService.validateAndCalculate(
            body.code,
            body.subtotal,
            userId,
        );

        return reply.status(200).send({
            status: "success",
            message: result.message,
            data: result,
        });
    }

    /**
     * Lists all coupons redeemed by the authenticated user across their orders.
     */
    async getMyHistory(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const query = req.query as { page?: number; limit?: number };
        const result = await couponUsageService.getUserCouponHistory(userId, query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Creates a new promotional coupon.
     */
    async createCoupon(req: FastifyRequest, reply: FastifyReply) {
        const input = createCouponSchema.parse(req.body);
        const result = await couponService.createCoupon(input);

        return reply.status(201).send({
            status: "success",
            message: `Coupon "${result.code}" created successfully`,
            data: result,
        });
    }

    /**
     * Admin: Lists all promotional coupons with search and status filters.
     */
    async listCoupons(req: FastifyRequest, reply: FastifyReply) {
        const query = couponQuerySchema.parse(req.query);
        const result = await couponService.listCoupons(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Retrieves coupon details and usage statistics by ID.
     */
    async getCouponById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await couponService.getCouponById(id);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Updates an existing promotional coupon.
     */
    async updateCoupon(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const input = updateCouponSchema.parse(req.body);
        const result = await couponService.updateCoupon(id, input);

        return reply.status(200).send({
            status: "success",
            message: `Coupon "${result.code}" updated successfully`,
            data: result,
        });
    }

    /**
     * Admin: Deletes or archives a coupon.
     */
    async deleteCoupon(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await couponService.deleteCoupon(id);

        return reply.status(200).send({
            status: "success",
            message: result.message,
            data: result,
        });
    }

    /**
     * Admin: Toggles coupon status (ACTIVE, INACTIVE, EXPIRED).
     */
    async toggleStatus(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const input = toggleCouponStatusSchema.parse(req.body);
        const result = await couponService.toggleStatus(id, input);

        return reply.status(200).send({
            status: "success",
            message: `Coupon status changed to ${result.status}`,
            data: result,
        });
    }

    /**
     * Admin: Lists usage audit history for a specific coupon.
     */
    async listCouponUsages(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const query = couponUsageQuerySchema.parse({ ...((req.query as any) || {}), couponId: id });
        const result = await couponUsageService.listCouponUsages(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Retrieves promotion and coupon analytics.
     */
    async getMetrics(_req: FastifyRequest, reply: FastifyReply) {
        const result = await couponMetricsService.getCouponMetrics();

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }
}

export const couponController = new CouponController();
