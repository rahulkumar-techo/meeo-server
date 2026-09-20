import type {
    Promotion,
    PromotionStatus,
    PromotionType,
    PromotionStackingRule,
    CustomerSegment,
} from "@/generated/prisma/client.js";

/**
 * Standard item format passed into the PromotionEngine for calculation.
 */
export interface PromotionCartItem {
    productId: string;
    variantId?: string | null | undefined;
    categoryId?: string | null | undefined;
    brandId?: string | null | undefined;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
}

/**
 * Contextual data about the shopping cart and customer.
 */
export interface PromotionEvaluationContext {
    userId?: string | null | undefined;
    customerSegment?: CustomerSegment | undefined;
    orderCount?: number | undefined;
    subtotal: number;
    shippingFee?: number | undefined;
    promoCode?: string | null | undefined;
    currentTime?: Date | undefined;
    items: PromotionCartItem[];
}

/**
 * Breakdown of discount applied to a specific cart line item.
 */
export interface ItemDiscountAllocation {
    productId: string;
    variantId?: string | null | undefined;
    productName: string;
    originalLineTotal: number;
    discountAmount: number;
    finalLineTotal: number;
    appliedPromotionId: string;
    appliedPromotionName: string;
}

/**
 * Detailed report of an individual applied promotion.
 */
export interface AppliedPromotionDetail {
    id: string;
    name: string;
    slug: string;
    code?: string | null | undefined;
    type: PromotionType;
    stackingRule: PromotionStackingRule;
    isAutomatic: boolean;
    discountAmount: number;
    isFreeShipping: boolean;
    freeShippingDiscount: number;
    matchedItemCount: number;
    description?: string | null | undefined;
}

/**
 * Output of the PromotionEngine evaluation.
 */
export interface PromotionCalculationResult {
    originalSubtotal: number;
    discountSubtotal: number;
    shippingFee: number;
    shippingDiscount: number;
    finalShippingFee: number;
    isFreeShipping: boolean;
    grandTotal: number;
    totalDiscount: number;
    appliedPromotions: AppliedPromotionDetail[];
    itemAllocations: ItemDiscountAllocation[];
    ineligiblePromotions?: Array<{
        id: string;
        name: string;
        code?: string | null | undefined;
        reason: string;
    }> | undefined;
}

/**
 * Result of checking a promotion's eligibility against context.
 */
export interface PromotionEligibilityResult {
    isEligible: boolean;
    reason?: string | undefined;
    matchedItems?: PromotionCartItem[] | undefined;
    eligibleSubtotal?: number | undefined;
}

export type {
    Promotion,
    PromotionStatus,
    PromotionType,
    PromotionStackingRule,
    CustomerSegment,
};
