import type {
    Promotion,
    PromotionCartItem,
    PromotionEvaluationContext,
    PromotionCalculationResult,
    AppliedPromotionDetail,
    ItemDiscountAllocation,
    PromotionEligibilityResult,
} from "../types/promotion.types.js";

export class PromotionEngine {
    /**
     * Evaluates a list of candidate promotions against the cart context and returns calculated totals.
     */
    evaluate(
        promotions: Promotion[],
        context: PromotionEvaluationContext
    ): PromotionCalculationResult {
        const now = context.currentTime ?? new Date();
        const originalSubtotal = Number(context.subtotal.toFixed(2));
        const shippingFee = Number((context.shippingFee ?? 0).toFixed(2));
        const ineligibleList: Array<{ id: string; name: string; code?: string | null; reason: string }> = [];

        // 1. Filter eligible candidates
        const eligiblePromotions: Array<{ promo: Promotion; eligibility: PromotionEligibilityResult }> = [];

        for (const promo of promotions) {
            const eligibility = this.checkEligibility(promo, context, now);
            if (eligibility.isEligible) {
                eligiblePromotions.push({ promo, eligibility });
            } else {
                ineligibleList.push({
                    id: promo.id,
                    name: promo.name,
                    code: promo.code,
                    reason: eligibility.reason || "Eligibility criteria not met",
                });
            }
        }

        // 2. Sort by priority descending (higher integer = evaluated first)
        eligiblePromotions.sort((a, b) => b.promo.priority - a.promo.priority);

        // 3. Resolve Stacking & Calculate Discounts
        const appliedPromotions: AppliedPromotionDetail[] = [];
        const itemAllocations: ItemDiscountAllocation[] = [];
        let remainingSubtotal = originalSubtotal;
        let runningDiscountSubtotal = 0;
        let isFreeShipping = false;
        let isExclusiveApplied = false;

        for (const { promo, eligibility } of eligiblePromotions) {
            if (isExclusiveApplied) break;

            if (promo.stackingRule === "EXCLUSIVE" && appliedPromotions.length > 0) {
                continue;
            }

            const calc = this.calculateDiscount(promo, eligibility, context, remainingSubtotal);
            if (calc.discountAmount <= 0 && !calc.isFreeShipping) continue;

            appliedPromotions.push({
                id: promo.id,
                name: promo.name,
                slug: promo.slug,
                code: promo.code,
                type: promo.type,
                stackingRule: promo.stackingRule,
                isAutomatic: promo.isAutomatic,
                discountAmount: Number(calc.discountAmount.toFixed(2)),
                isFreeShipping: calc.isFreeShipping,
                freeShippingDiscount: calc.isFreeShipping ? shippingFee : 0,
                matchedItemCount: eligibility.matchedItems?.length ?? 0,
                description: promo.description,
            });

            if (calc.allocations?.length) {
                itemAllocations.push(...calc.allocations);
            }

            runningDiscountSubtotal += calc.discountAmount;
            remainingSubtotal = Math.max(0, originalSubtotal - runningDiscountSubtotal);

            if (calc.isFreeShipping) isFreeShipping = true;
            if (promo.stackingRule === "EXCLUSIVE") isExclusiveApplied = true;
            if (!promo.isStackable && appliedPromotions.length > 0) break;
        }

        const discountSubtotal = Math.min(originalSubtotal, Number(runningDiscountSubtotal.toFixed(2)));
        const finalShippingDiscount = isFreeShipping ? shippingFee : 0;
        const finalShippingFee = Math.max(0, Number((shippingFee - finalShippingDiscount).toFixed(2)));
        const grandTotal = Math.max(0, Number((originalSubtotal - discountSubtotal + finalShippingFee).toFixed(2)));

        return {
            originalSubtotal,
            discountSubtotal,
            shippingFee,
            shippingDiscount: finalShippingDiscount,
            finalShippingFee,
            isFreeShipping,
            grandTotal,
            totalDiscount: Number((discountSubtotal + finalShippingDiscount).toFixed(2)),
            appliedPromotions,
            itemAllocations,
            ineligiblePromotions: ineligibleList,
        };
    }

    /**
     * Checks if a specific promotion is eligible for the current cart context.
     */
    checkEligibility(
        promo: Promotion,
        context: PromotionEvaluationContext,
        now: Date
    ): PromotionEligibilityResult {
        if (promo.status !== "ACTIVE") {
            return { isEligible: false, reason: `Promotion is in ${promo.status} status` };
        }

        if (promo.startsAt && promo.startsAt > now) {
            return { isEligible: false, reason: "Promotion campaign has not started yet" };
        }
        if (promo.endsAt && promo.endsAt < now) {
            return { isEligible: false, reason: "Promotion campaign has expired" };
        }

        // Flash sale time of day window
        if (promo.timeOfDayStart && promo.timeOfDayEnd) {
            const currentHours = String(now.getUTCHours()).padStart(2, "0");
            const currentMins = String(now.getUTCMinutes()).padStart(2, "0");
            const currentTimeStr = `${currentHours}:${currentMins}`;
            if (currentTimeStr < promo.timeOfDayStart || currentTimeStr > promo.timeOfDayEnd) {
                return { isEligible: false, reason: `Flash sale only active between ${promo.timeOfDayStart} and ${promo.timeOfDayEnd} UTC` };
            }
        }

        // Days of week
        if (promo.daysOfWeek?.length > 0 && !promo.daysOfWeek.includes(now.getUTCDay())) {
            return { isEligible: false, reason: "Promotion is not active on this day of the week" };
        }

        // Total usage limit
        if (promo.totalUsageLimit !== null && promo.totalUsageLimit !== undefined && promo.currentUsageCount >= promo.totalUsageLimit) {
            return { isEligible: false, reason: "Promotion has reached its global redemption limit" };
        }

        // First order requirement
        if ((promo.firstOrderOnly || promo.customerSegment === "FIRST_TIME_BUYER") && (context.orderCount ?? 0) > 0) {
            return { isEligible: false, reason: "Promotion is valid for first-time orders only" };
        }

        // Customer segment validation
        if (promo.customerSegment === "REGISTERED" && !context.userId) {
            return { isEligible: false, reason: "Login required to redeem this promotion" };
        }
        if (promo.customerSegment === "RETURNING" && (context.orderCount ?? 0) === 0) {
            return { isEligible: false, reason: "Promotion is valid for returning customers only" };
        }
        if (promo.customerSegment === "VIP" && context.customerSegment !== "VIP") {
            return { isEligible: false, reason: "Promotion is reserved for VIP members only" };
        }

        // Match cart items based on scope targeting
        const matchedItems = this.getMatchingItems(promo, context.items);
        if (matchedItems.length === 0) {
            return { isEligible: false, reason: "No cart items match the promotional target criteria" };
        }

        const eligibleSubtotal = matchedItems.reduce((acc, item) => acc + item.lineTotal, 0);
        const totalEligibleQuantity = matchedItems.reduce((acc, item) => acc + item.quantity, 0);

        if (promo.minOrderSubtotal && eligibleSubtotal < Number(promo.minOrderSubtotal)) {
            return {
                isEligible: false,
                reason: `Minimum required subtotal for this promotion is ${Number(promo.minOrderSubtotal).toFixed(2)} (eligible subtotal: ${eligibleSubtotal.toFixed(2)})`,
            };
        }

        if (promo.minQuantity && totalEligibleQuantity < promo.minQuantity) {
            return {
                isEligible: false,
                reason: `Requires at least ${promo.minQuantity} qualifying items (current: ${totalEligibleQuantity})`,
            };
        }

        return { isEligible: true, matchedItems, eligibleSubtotal };
    }

    /**
     * Resolves matching cart items according to targeting and exclusion rules.
     */
    private getMatchingItems(promo: Promotion, items: PromotionCartItem[]): PromotionCartItem[] {
        return items.filter((item) => {
            if (promo.excludedProductIds?.includes(item.productId)) return false;
            if (item.categoryId && promo.excludedCategoryIds?.includes(item.categoryId)) return false;

            const hasProductTargets = (promo.targetProductIds?.length ?? 0) > 0;
            const hasCategoryTargets = (promo.targetCategoryIds?.length ?? 0) > 0;
            const hasBrandTargets = (promo.targetBrandIds?.length ?? 0) > 0;

            if (!hasProductTargets && !hasCategoryTargets && !hasBrandTargets) {
                return true;
            }

            const matchesProduct = hasProductTargets && promo.targetProductIds.includes(item.productId);
            const matchesCategory = hasCategoryTargets && !!item.categoryId && promo.targetCategoryIds.includes(item.categoryId);
            const matchesBrand = hasBrandTargets && !!item.brandId && promo.targetBrandIds.includes(item.brandId);

            return matchesProduct || matchesCategory || matchesBrand;
        });
    }

    /**
     * Calculates discount amounts and line item allocations for an eligible promotion.
     */
    private calculateDiscount(
        promo: Promotion,
        eligibility: PromotionEligibilityResult,
        _context: PromotionEvaluationContext,
        remainingSubtotal: number
    ): { discountAmount: number; isFreeShipping: boolean; allocations: ItemDiscountAllocation[] } {
        let discountAmount = 0;
        let isFreeShipping = false;
        const allocations: ItemDiscountAllocation[] = [];
        const eligibleSubtotal = eligibility.eligibleSubtotal ?? 0;
        const discountVal = Number(promo.discountValue ?? 0);
        const maxDiscount = promo.maxDiscountAmount ? Number(promo.maxDiscountAmount) : Infinity;

        switch (promo.type) {
            case "PERCENTAGE":
            case "FLASH_SALE":
            case "PRODUCT_DISCOUNT":
            case "CATEGORY_DISCOUNT":
            case "BRAND_DISCOUNT": {
                const rawDiscount = (eligibleSubtotal * discountVal) / 100;
                discountAmount = Math.min(rawDiscount, maxDiscount, remainingSubtotal);

                if (eligibility.matchedItems?.length && eligibleSubtotal > 0) {
                    for (const item of eligibility.matchedItems) {
                        const itemShare = (item.lineTotal / eligibleSubtotal) * discountAmount;
                        allocations.push({
                            productId: item.productId,
                            variantId: item.variantId ?? undefined,
                            productName: item.productName,
                            originalLineTotal: item.lineTotal,
                            discountAmount: Number(itemShare.toFixed(2)),
                            finalLineTotal: Number(Math.max(0, item.lineTotal - itemShare).toFixed(2)),
                            appliedPromotionId: promo.id,
                            appliedPromotionName: promo.name,
                        });
                    }
                }
                break;
            }

            case "FIXED_DISCOUNT": {
                discountAmount = Math.min(discountVal, eligibleSubtotal, remainingSubtotal);
                break;
            }

            case "FREE_SHIPPING": {
                isFreeShipping = true;
                discountAmount = 0;
                break;
            }

            case "BUY_X_GET_Y": {
                const buyX = promo.buyXQuantity ?? 1;
                const getY = promo.getYQuantity ?? 1;
                const discountPct = Number(promo.getYDiscountPercentage ?? 100) / 100;
                const groupSize = buyX + getY;

                for (const item of eligibility.matchedItems ?? []) {
                    const fullGroups = Math.floor(item.quantity / groupSize);
                    if (fullGroups > 0) {
                        const discountedUnits = fullGroups * getY;
                        const itemDiscount = discountedUnits * item.unitPrice * discountPct;
                        const cappedItemDiscount = Math.min(itemDiscount, item.lineTotal, remainingSubtotal);
                        discountAmount += cappedItemDiscount;

                        allocations.push({
                            productId: item.productId,
                            variantId: item.variantId ?? undefined,
                            productName: item.productName,
                            originalLineTotal: item.lineTotal,
                            discountAmount: Number(cappedItemDiscount.toFixed(2)),
                            finalLineTotal: Number((item.lineTotal - cappedItemDiscount).toFixed(2)),
                            appliedPromotionId: promo.id,
                            appliedPromotionName: promo.name,
                        });
                    }
                }
                discountAmount = Math.min(discountAmount, remainingSubtotal);
                break;
            }
        }

        return {
            discountAmount: Number(Math.max(0, discountAmount).toFixed(2)),
            isFreeShipping,
            allocations,
        };
    }
}

export const promotionEngine = new PromotionEngine();
