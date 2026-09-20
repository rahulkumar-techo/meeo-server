import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { promotionCacheService } from "./promotionCache.service.js";
import { promotionEngine } from "./promotionEngine.service.js";
import { promotionUsageService } from "./promotionUsage.service.js";
import { auditLogService } from "@/modules/audit/services/auditLog.service.js";
import type {
    CreatePromotionInput,
    UpdatePromotionInput,
    PromotionQueryInput,
    PreviewPromotionInput,
} from "../validations/promotion.validation.js";
import type { PromotionStatus, CustomerSegment } from "@/generated/prisma/client.js";
import type { PromotionCartItem } from "../types/promotion.types.js";

export class PromotionService {
    /**
     * Creates a new promotional campaign.
     */
    async createPromotion(input: CreatePromotionInput, createdById?: string) {
        const existingSlug = await prisma.promotion.findUnique({ where: { slug: input.slug } });
        if (existingSlug) {
            throw new AppError(`Promotion with slug "${input.slug}" already exists`, 409);
        }

        if (input.code) {
            const existingCode = await prisma.promotion.findUnique({ where: { code: input.code } });
            if (existingCode) {
                throw new AppError(`Promotion code "${input.code}" is already in use`, 409);
            }
        }

        const data: any = {
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            code: input.code ?? null,
            type: input.type,
            status: input.status ?? "DRAFT",
            priority: input.priority ?? 0,
            isStackable: input.isStackable ?? false,
            stackingRule: input.stackingRule ?? "EXCLUSIVE",
            isAutomatic: input.isAutomatic ?? false,
            customerSegment: input.customerSegment ?? "ALL",
            firstOrderOnly: input.firstOrderOnly ?? false,
            discountValue: input.discountValue ?? null,
            maxDiscountAmount: input.maxDiscountAmount ?? null,
            minOrderSubtotal: input.minOrderSubtotal ?? null,
            minQuantity: input.minQuantity ?? null,
            buyXQuantity: input.buyXQuantity ?? null,
            getYQuantity: input.getYQuantity ?? null,
            getYDiscountPercentage: input.getYDiscountPercentage ?? null,
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            timeOfDayStart: input.timeOfDayStart ?? null,
            timeOfDayEnd: input.timeOfDayEnd ?? null,
            daysOfWeek: input.daysOfWeek ?? [],
            totalUsageLimit: input.totalUsageLimit ?? null,
            userUsageLimit: input.userUsageLimit ?? null,
            targetProductIds: input.targetProductIds ?? [],
            targetCategoryIds: input.targetCategoryIds ?? [],
            targetBrandIds: input.targetBrandIds ?? [],
            excludedProductIds: input.excludedProductIds ?? [],
            excludedCategoryIds: input.excludedCategoryIds ?? [],
            metadata: input.metadata ?? undefined,
            createdById: createdById ?? null,
        };

        const promotion = await prisma.promotion.create({ data });

        await promotionCacheService.invalidateAll();

        await auditLogService.recordLog({
            actorId: createdById,
            action: "PROMOTION_CREATED",
            entityType: "Promotion",
            entityId: promotion.id,
            newValue: promotion,
        });

        return promotion;
    }

    /**
     * Updates an existing promotion with cache invalidation and audit logging.
     */
    async updatePromotion(id: string, input: UpdatePromotionInput, actorId?: string) {
        const existing = await prisma.promotion.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(`Promotion with ID "${id}" not found`, 404);
        }

        if (input.slug && input.slug !== existing.slug) {
            const conflict = await prisma.promotion.findUnique({ where: { slug: input.slug } });
            if (conflict) throw new AppError(`Slug "${input.slug}" already exists`, 409);
        }

        if (input.code && input.code !== existing.code) {
            const conflict = await prisma.promotion.findUnique({ where: { code: input.code } });
            if (conflict) throw new AppError(`Code "${input.code}" already exists`, 409);
        }

        const data: any = {};
        for (const [key, val] of Object.entries(input)) {
            if (val !== undefined) {
                if (key === "startsAt") {
                    data.startsAt = val ? new Date(val as string) : null;
                } else if (key === "endsAt") {
                    data.endsAt = val ? new Date(val as string) : null;
                } else {
                    data[key] = val;
                }
            }
        }

        const updated = await prisma.promotion.update({
            where: { id },
            data,
        });

        await promotionCacheService.invalidateAll();

        await auditLogService.recordLog({
            actorId,
            action: "PROMOTION_UPDATED",
            entityType: "Promotion",
            entityId: updated.id,
            oldValue: existing,
            newValue: updated,
        });

        return updated;
    }

    /**
     * Updates promotion status (e.g. DRAFT -> ACTIVE, ACTIVE -> PAUSED, ARCHIVED).
     */
    async updateStatus(id: string, status: PromotionStatus, actorId?: string) {
        const existing = await prisma.promotion.findUnique({ where: { id } });
        if (!existing) throw new AppError("Promotion not found", 404);

        const updated = await prisma.promotion.update({
            where: { id },
            data: { status },
        });

        await promotionCacheService.invalidateAll();

        await auditLogService.recordLog({
            actorId,
            action: `PROMOTION_STATUS_${status}`,
            entityType: "Promotion",
            entityId: id,
            oldValue: { status: existing.status },
            newValue: { status: updated.status },
        });

        return updated;
    }

    /**
     * Fetches promotion by ID with usage statistics.
     */
    async getPromotionById(id: string) {
        const promo = await prisma.promotion.findUnique({
            where: { id },
            include: {
                creator: { select: { id: true, firstName: true, lastName: true, email: true } },
                _count: { select: { usages: true } },
            },
        });
        if (!promo) throw new AppError("Promotion not found", 404);

        const stats = await promotionUsageService.getPromotionUsageStats(id);
        return { ...promo, stats };
    }

    /**
     * Lists promotions with multi-field search and pagination.
     */
    async listPromotions(query: PromotionQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: "insensitive" } },
                { slug: { contains: query.search, mode: "insensitive" } },
                { code: { contains: query.search, mode: "insensitive" } },
            ];
        }
        if (query.type) where.type = query.type;
        if (query.status) where.status = query.status;
        if (query.isAutomatic !== undefined) where.isAutomatic = query.isAutomatic;
        if (query.customerSegment) where.customerSegment = query.customerSegment;

        const [promotions, total] = await Promise.all([
            prisma.promotion.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [query.sortBy]: query.sortOrder },
                include: { _count: { select: { usages: true } } },
            }),
            prisma.promotion.count({ where }),
        ]);

        return {
            promotions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Customer preview & server-side calculation of applicable promotions for cart items.
     */
    async previewCart(input: PreviewPromotionInput, userId?: string) {
        let orderCount = 0;
        let customerSegment: CustomerSegment = "ALL";

        if (userId) {
            orderCount = await prisma.order.count({ where: { userId, status: { not: "CANCELLED" } } });
            customerSegment = orderCount === 0 ? "FIRST_TIME_BUYER" : "RETURNING";
        }

        const candidatePromotions = await this.resolveCandidatePromotions(input.promoCode);

        const subtotal = input.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

        const formattedItems: PromotionCartItem[] = input.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId ?? undefined,
            categoryId: i.categoryId ?? undefined,
            brandId: i.brandId ?? undefined,
            productName: i.productName,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.unitPrice * i.quantity,
        }));

        return promotionEngine.evaluate(candidatePromotions, {
            userId: userId ?? undefined,
            customerSegment,
            orderCount,
            subtotal,
            shippingFee: input.shippingFee,
            promoCode: input.promoCode ?? undefined,
            currentTime: new Date(),
            items: formattedItems,
        });
    }

    /**
     * Resolves all active automatic promotions plus any requested promo code.
     */
    async resolveCandidatePromotions(promoCode?: string | null) {
        let autoPromos = await promotionCacheService.getActiveAutomaticPromotions();
        if (!autoPromos) {
            autoPromos = await prisma.promotion.findMany({
                where: { isAutomatic: true, status: "ACTIVE" },
                orderBy: { priority: "desc" },
            });
            await promotionCacheService.setActiveAutomaticPromotions(autoPromos);
        }

        const candidates = [...autoPromos];

        if (promoCode) {
            const normalizedCode = promoCode.trim().toUpperCase();
            let codePromo = await promotionCacheService.getPromotionByCode(normalizedCode);
            if (!codePromo) {
                codePromo = await prisma.promotion.findUnique({
                    where: { code: normalizedCode, status: "ACTIVE" },
                });
                if (codePromo) {
                    await promotionCacheService.setPromotionByCode(normalizedCode, codePromo);
                }
            }

            if (codePromo && !candidates.some((p) => p.id === codePromo!.id)) {
                candidates.push(codePromo);
            }
        }

        return candidates;
    }

    /**
     * Direct single promo-code validation.
     */
    async validatePromoCode(code: string, _subtotal: number, userId?: string) {
        const normalized = code.trim().toUpperCase();
        const promo = await prisma.promotion.findUnique({
            where: { code: normalized },
            include: { _count: { select: { usages: true } } },
        });

        if (!promo || promo.status !== "ACTIVE") {
            throw new AppError(`Promotion code "${normalized}" is invalid or inactive`, 400);
        }

        if (userId && promo.userUsageLimit) {
            await promotionUsageService.validateUserUsageLimit(promo.id, userId, promo.userUsageLimit);
        }

        return {
            valid: true,
            promotion: {
                id: promo.id,
                name: promo.name,
                code: promo.code,
                type: promo.type,
                discountValue: promo.discountValue,
                minOrderSubtotal: promo.minOrderSubtotal,
            },
        };
    }
}

export const promotionService = new PromotionService();
