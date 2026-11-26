import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { fuzzySearchItems } from "@/common/utils/fuzzySearch.js";
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
                    items: { include: { taxSnapshot: true } },
                    address: true,
                    statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
                    taxSnapshot: true,
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
        const searchTerm = search?.trim() ?? "";

        const where: any = {
            ...(status ? { status } : {}),
            ...(startDate || endDate
                ? {
                    createdAt: {
                        ...(startDate ? { gte: new Date(startDate) } : {}),
                        ...(endDate ? { lte: new Date(endDate) } : {}),
                    },
                }
                : {}),
        };

        const include = {
            items: { include: { taxSnapshot: true } },
            address: true,
            statusHistory: { orderBy: { createdAt: "desc" as const }, take: 1 },
            taxSnapshot: true,
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            payments: {
                select: {
                    id: true,
                    provider: true,
                    paymentMethod: true,
                    status: true,
                    amount: true,
                    paidAmount: true,
                },
                orderBy: { createdAt: "desc" as const },
            },
        };

        let total: number;
        let orders: any[];

        if (searchTerm) {
            const candidates = await prisma.order.findMany({
                where,
                take: 250,
                orderBy: { createdAt: "desc" },
                include,
            });

            const ranked = fuzzySearchItems(
                candidates.map((o: any) => ({
                    raw: o,
                    orderNumber: o.orderNumber ?? "",
                    recipientName: o.address?.recipientName ?? "",
                    recipientPhone: o.address?.phone ?? "",
                    customerEmail: o.user?.email ?? "",
                    customerName: `${o.user?.firstName ?? ""} ${o.user?.lastName ?? ""}`.trim(),
                    itemsText: (o.items ?? []).map((i: any) => `${i.productName ?? ""} ${i.sku ?? ""}`).join(" "),
                })),
                searchTerm,
                {
                    keys: [
                        { name: "orderNumber", weight: 3 },
                        { name: "customerName", weight: 2.5 },
                        { name: "recipientName", weight: 2.5 },
                        { name: "customerEmail", weight: 2 },
                        { name: "recipientPhone", weight: 1.5 },
                        { name: "itemsText", weight: 1.5 },
                    ],
                },
            ).map((entry) => entry.raw);

            total = ranked.length;
            orders = ranked.slice(skip, skip + limit);
        } else {
            [total, orders] = await Promise.all([
                prisma.order.count({ where }),
                prisma.order.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: "desc" },
                    include,
                }),
            ]);
        }

        return {
            items: orders.map((o) => {
                const formatted = orderCreationService.formatOrderResponse(o);
                const latestPayment = o.payments?.[0];
                return {
                    ...formatted,
                    customer: o.user,
                    paymentProvider: latestPayment?.provider ?? null,
                    paymentMethod: latestPayment?.paymentMethod ?? latestPayment?.provider ?? null,
                    paymentStatus: latestPayment?.status ?? null,
                };
            }),
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
                items: { include: { taxSnapshot: true } },
                address: true,
                statusHistory: { orderBy: { createdAt: "desc" } },
                couponUsages: { include: { coupon: { select: { code: true, type: true } } } },
                reservations: true,
                payments: true,
                taxSnapshot: true,
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
                items: { include: { taxSnapshot: true } },
                address: true,
                statusHistory: { orderBy: { createdAt: "desc" } },
                couponUsages: { include: { coupon: { select: { code: true, type: true } } } },
                reservations: true,
                payments: true,
                taxSnapshot: true,
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
