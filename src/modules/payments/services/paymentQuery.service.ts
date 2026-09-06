import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { QueryPaymentsInput } from "../validations/payment.validation.js";

export class PaymentQueryService {
    /**
     * Retrieves payment details by ID, ensuring customer ownership if userId is passed.
     */
    async getPaymentById(paymentId: string, userId?: string) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        userId: true,
                        status: true,
                        grandTotal: true,
                        currency: true,
                    },
                },
                attempts: { orderBy: { attemptNumber: "asc" } },
                transactions: { orderBy: { createdAt: "desc" } },
                refunds: { orderBy: { requestedAt: "desc" } },
            },
        });

        if (!payment) {
            throw new AppError("Payment record not found", 404);
        }

        if (userId && payment.order.userId && payment.order.userId !== userId) {
            throw new AppError("Forbidden: You cannot view this payment", 403);
        }

        return payment;
    }

    /**
     * Lists payments for admin with filtering and pagination.
     */
    async listPayments(query: QueryPaymentsInput) {
        const { page = 1, limit = 20, status, orderId, provider } = query;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (orderId) where.orderId = orderId;
        if (provider) where.provider = { equals: provider, mode: "insensitive" };

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    order: {
                        select: {
                            id: true,
                            orderNumber: true,
                            userId: true,
                            status: true,
                        },
                    },
                    attempts: { select: { id: true, attemptNumber: true, status: true } },
                    refunds: { select: { id: true, amount: true, status: true } },
                },
            }),
            prisma.payment.count({ where }),
        ]);

        return {
            data: payments,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

export const paymentQueryService = new PaymentQueryService();
