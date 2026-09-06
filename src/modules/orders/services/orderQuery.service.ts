import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { orderCreationService } from "./orderCreation.service.js";
import type { OrderQueryInput } from "../validations/order.validation.js";

export class OrderQueryService {
    /**
     * Retrieves paginated orders for a specific authenticated customer.
     */
    async listUserOrders(userId: string, query: OrderQueryInput) {
        const { page = 1, limit = 20, status, search, startDate, endDate } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            userId,
            ...(status ? { status } : {}),
            ...(search ? { orderNumber: { contains: search, mode: "insensitive" } } : {}),
            ...(startDate || endDate
                ? {
                    createdAt: {
                        ...(startDate ? { gte: new Date(startDate) } : {}),
                        ...(endDate ? { lte: new Date(endDate) } : {}),
                    },
                }
                : {}),
        };

        const [total, orders] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    items: true,
                    address: true,
                    statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
                },
            }),
        ]);

        return {
            items: orders.map((o) => orderCreationService.formatOrderResponse(o)),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Admin view: lists all customer orders with filtering, date ranges, and pagination.
     */
    async listAllOrders(query: OrderQueryInput) {
        const { page = 1, limit = 20, status, search, startDate, endDate } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(status ? { status } : {}),
            ...(search
                ? {
                    OR: [
                        { orderNumber: { contains: search, mode: "insensitive" } },
                        { address: { recipientName: { contains: search, mode: "insensitive" } } },
                        { user: { email: { contains: search, mode: "insensitive" } } },
                    ],
                }
                : {}),
            ...(startDate || endDate
                ? {
                    createdAt: {
                        ...(startDate ? { gte: new Date(startDate) } : {}),
                        ...(endDate ? { lte: new Date(endDate) } : {}),
                    },
                }
                : {}),
        };

        const [total, orders] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    items: true,
                    address: true,
                    statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
                    user: { select: { id: true, email: true, firstName: true, lastName: true } },
                },
            }),
        ]);

        return {
            items: orders.map((o) => ({
                ...orderCreationService.formatOrderResponse(o),
                customer: o.user,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Retrieves an order by ID with ownership verification.
     */
    async getOrderById(orderId: string, userId?: string, isAdmin = false) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                address: true,
                statusHistory: { orderBy: { createdAt: "desc" } },
                couponUsages: { include: { coupon: { select: { code: true, type: true } } } },
                reservations: true,
                payments: true,
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (!isAdmin && userId && order.userId !== userId) {
            throw new AppError("You are not authorized to view this order", 403);
        }

        return {
            ...orderCreationService.formatOrderResponse(order),
            customer: order.user,
            payments: order.payments ?? [],
        };
    }

    /**
     * Retrieves an order by unique order number.
     */
    async getOrderByNumber(orderNumber: string, userId?: string, isAdmin = false) {
        const order = await prisma.order.findUnique({
            where: { orderNumber },
            include: {
                items: true,
                address: true,
                statusHistory: { orderBy: { createdAt: "desc" } },
                couponUsages: { include: { coupon: { select: { code: true, type: true } } } },
                reservations: true,
                payments: true,
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });

        if (!order) {
            throw new AppError(`Order "${orderNumber}" not found`, 404);
        }

        if (!isAdmin && userId && order.userId !== userId) {
            throw new AppError("You are not authorized to view this order", 403);
        }

        return {
            ...orderCreationService.formatOrderResponse(order),
            customer: order.user,
            payments: order.payments ?? [],
        };
    }
}

export const orderQueryService = new OrderQueryService();
