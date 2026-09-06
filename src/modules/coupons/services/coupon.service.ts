import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type {
    CreateCouponInput,
    UpdateCouponInput,
    CouponQueryInput,
    ToggleCouponStatusInput,
} from "../validations/coupon.validation.js";

export class CouponService {
    /**
     * Creates a new promotional coupon.
     */
    async createCoupon(input: CreateCouponInput) {
        const normalizedCode = input.code.trim().toUpperCase();

        const existing = await prisma.coupon.findUnique({
            where: { code: normalizedCode },
        });

        if (existing) {
            throw new AppError(`Coupon with code "${normalizedCode}" already exists`, 409);
        }

        return prisma.coupon.create({
            data: {
                code: normalizedCode,
                type: input.type,
                value: input.value,
                minimumOrderAmount: input.minimumOrderAmount ?? null,
                maximumDiscountAmount: input.maximumDiscountAmount ?? null,
                usageLimit: input.usageLimit ?? null,
                usageLimitPerUser: input.usageLimitPerUser ?? null,
                startsAt: input.startsAt ? new Date(input.startsAt) : null,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                status: input.status ?? "ACTIVE",
            },
        });
    }

    /**
     * Updates an existing coupon by ID.
     */
    async updateCoupon(id: string, input: UpdateCouponInput) {
        const coupon = await prisma.coupon.findUnique({
            where: { id },
        });

        if (!coupon) {
            throw new AppError("Coupon not found", 404);
        }

        if (input.code && input.code !== coupon.code) {
            const normalizedCode = input.code.trim().toUpperCase();
            const existing = await prisma.coupon.findUnique({
                where: { code: normalizedCode },
            });

            if (existing && existing.id !== id) {
                throw new AppError(`Coupon code "${normalizedCode}" already exists`, 409);
            }
        }

        const updateData: any = {};
        if (input.code !== undefined) updateData.code = input.code.trim().toUpperCase();
        if (input.type !== undefined) updateData.type = input.type;
        if (input.value !== undefined) updateData.value = input.value;
        if (input.minimumOrderAmount !== undefined) updateData.minimumOrderAmount = input.minimumOrderAmount;
        if (input.maximumDiscountAmount !== undefined) updateData.maximumDiscountAmount = input.maximumDiscountAmount;
        if (input.usageLimit !== undefined) updateData.usageLimit = input.usageLimit;
        if (input.usageLimitPerUser !== undefined) updateData.usageLimitPerUser = input.usageLimitPerUser;
        if (input.startsAt !== undefined) updateData.startsAt = input.startsAt ? new Date(input.startsAt) : null;
        if (input.expiresAt !== undefined) updateData.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (input.status !== undefined) updateData.status = input.status;

        return prisma.coupon.update({
            where: { id },
            data: updateData,
            include: {
                _count: { select: { usages: true } },
            },
        });
    }

    /**
     * Retrieves coupon details and usage stats by ID.
     */
    async getCouponById(id: string) {
        const coupon = await prisma.coupon.findUnique({
            where: { id },
            include: {
                _count: { select: { usages: true } },
                usages: {
                    take: 5,
                    orderBy: { createdAt: "desc" },
                    include: {
                        order: {
                            select: { id: true, orderNumber: true, grandTotal: true, createdAt: true },
                        },
                    },
                },
            },
        });

        if (!coupon) {
            throw new AppError("Coupon not found", 404);
        }

        return coupon;
    }

    /**
     * Retrieves coupon by unique code.
     */
    async getCouponByCode(code: string) {
        const normalizedCode = code.trim().toUpperCase();
        const coupon = await prisma.coupon.findUnique({
            where: { code: normalizedCode },
            include: {
                _count: { select: { usages: true } },
            },
        });

        if (!coupon) {
            throw new AppError(`Coupon code "${normalizedCode}" not found`, 404);
        }

        return coupon;
    }

    /**
     * Lists coupons with filtering and pagination.
     */
    async listCoupons(query: CouponQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.search) {
            where.code = { contains: query.search.trim().toUpperCase(), mode: "insensitive" };
        }
        if (query.type) {
            where.type = query.type;
        }
        if (query.status) {
            where.status = query.status;
        }

        const [items, total] = await Promise.all([
            prisma.coupon.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    _count: { select: { usages: true } },
                },
            }),
            prisma.coupon.count({ where }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Deletes or soft-archives a coupon.
     */
    async deleteCoupon(id: string) {
        const coupon = await prisma.coupon.findUnique({
            where: { id },
            include: { _count: { select: { usages: true } } },
        });

        if (!coupon) {
            throw new AppError("Coupon not found", 404);
        }

        // If coupon has existing order usages, mark as INACTIVE rather than hard delete to preserve financial audit history
        if (coupon._count.usages > 0) {
            await prisma.coupon.update({
                where: { id },
                data: { status: "INACTIVE" },
            });
            return { deleted: false, archived: true, id, message: "Coupon has associated order usages; deactivated instead of deleted" };
        }

        await prisma.coupon.delete({
            where: { id },
        });

        return { deleted: true, archived: false, id, message: "Coupon deleted successfully" };
    }

    /**
     * Toggles coupon status (ACTIVE, INACTIVE, EXPIRED).
     */
    async toggleStatus(id: string, input: ToggleCouponStatusInput) {
        const coupon = await prisma.coupon.findUnique({
            where: { id },
        });

        if (!coupon) {
            throw new AppError("Coupon not found", 404);
        }

        return prisma.coupon.update({
            where: { id },
            data: { status: input.status },
        });
    }
}

export const couponService = new CouponService();
