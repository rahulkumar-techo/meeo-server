import { normalizeIndianState } from "../constants/indianStates.js";

/**
 * Standard rounding helper: round to 2 decimal places using half-up arithmetic.
 */
export function roundToTwoDecimals(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface GstLineItemInput {
    id: string; // CartItem ID or Variant ID
    productId: string;
    productName: string;
    sku?: string | null | undefined;
    hsnCode: string;
    quantity: number;
    unitPrice: number;
    taxRate: number; // Combined statutory rate e.g. 18.0
    cgstRate?: number | undefined;
    sgstRate?: number | undefined;
    igstRate?: number | undefined;
    cessRate?: number | undefined;
    taxTreatment?: "TAXABLE" | "NIL_RATED" | "EXEMPT" | "ZERO_RATED" | "NON_TAXABLE" | undefined;
    gstRuleId?: string | null | undefined;
    isInclusive?: boolean | undefined;
}

export interface CalculatedGstLineItem {
    id: string;
    productId: string;
    productName: string;
    sku?: string | null | undefined;
    hsnCode: string;
    quantity: number;
    unitPrice: number;
    grossLineTotal: number;
    allocatedDiscount: number;
    netTaxableAmount: number;
    taxTreatment: "TAXABLE" | "NIL_RATED" | "EXEMPT" | "ZERO_RATED" | "NON_TAXABLE";
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cessRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessAmount: number;
    totalTaxAmount: number;
    finalLineTotal: number;
    isInclusive: boolean;
    gstRuleId?: string | null | undefined;
}

export interface GstShippingCalculation {
    shippingFee: number;
    taxableAmount: number;
    sacCode: string;
    gstRate: number;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalTaxAmount: number;
    finalShippingTotal: number;
}

export interface GstCalculationResult {
    placeOfSupply: {
        sellerStateCode: string;
        sellerStateName: string;
        customerStateCode: string;
        customerStateName: string;
        isInterState: boolean;
    };
    items: CalculatedGstLineItem[];
    shipping: GstShippingCalculation;
    totals: {
        grossSubtotal: number;
        totalDiscount: number;
        totalTaxableAmount: number;
        totalCgstAmount: number;
        totalSgstAmount: number;
        totalIgstAmount: number;
        totalCessAmount: number;
        totalTaxAmount: number;
        shippingTotal: number;
        grandTotal: number;
    };
    calculationVersion: string;
    calculatedAt: string;
}

export class GstEngineService {
    public static readonly CALCULATION_VERSION = "v1.0";
    public static readonly DEFAULT_SHIPPING_SAC = "9968"; // Standard Courier / Postal Delivery

    /**
     * Determines whether a transaction is an intra-state or inter-state supply
     * under Section 7 and 8 of the Integrated Goods and Services Tax (IGST) Act, 2017.
     */
    determinePlaceOfSupply(
        sellerStateInput: string,
        customerStateInput: string,
    ): {
        sellerStateCode: string;
        sellerStateName: string;
        customerStateCode: string;
        customerStateName: string;
        isInterState: boolean;
    } {
        const sellerState = normalizeIndianState(sellerStateInput);
        const customerState = normalizeIndianState(customerStateInput);

        const sellerCode = sellerState?.code || "97"; // 97 = Other Territory / Export
        const sellerName = sellerState?.name || (sellerStateInput?.trim() ? sellerStateInput.trim() : "Other Territory");

        const customerCode = customerState?.code || "97";
        const customerName = customerState?.name || (customerStateInput?.trim() ? customerStateInput.trim() : "Other Territory");

        // Supply is inter-state if origin and destination differ or if export/non-domestic
        const isInterState = !sellerState || !customerState || sellerCode !== customerCode;

        return {
            sellerStateCode: sellerCode,
            sellerStateName: sellerName,
            customerStateCode: customerCode,
            customerStateName: customerName,
            isInterState,
        };
    }

    /**
     * Apportions order-level discounts proportionally across line items,
     * reconciling any rounding discrepancies (the penny problem) onto the largest line item.
     */
    allocateDiscounts(
        items: Array<{ id: string; grossTotal: number }>,
        totalDiscount: number,
    ): Map<string, number> {
        const discountMap = new Map<string, number>();
        const grossSubtotal = items.reduce((sum, i) => sum + i.grossTotal, 0);

        if (totalDiscount <= 0 || grossSubtotal <= 0) {
            for (const item of items) {
                discountMap.set(item.id, 0);
            }
            return discountMap;
        }

        const cappedDiscount = Math.min(totalDiscount, grossSubtotal);
        let allocatedSum = 0;
        let largestItem: { id: string; grossTotal: number } | undefined = items[0];

        for (const item of items) {
            if (largestItem && item.grossTotal > largestItem.grossTotal) {
                largestItem = item;
            }
            const ratio = item.grossTotal / grossSubtotal;
            const itemDiscount = roundToTwoDecimals(cappedDiscount * ratio);
            discountMap.set(item.id, itemDiscount);
            allocatedSum += itemDiscount;
        }

        // Reconcile residual discrepancy to ensure exact sum match
        const difference = roundToTwoDecimals(cappedDiscount - allocatedSum);
        if (Math.abs(difference) > 0.0001 && largestItem) {
            const currentLargest = discountMap.get(largestItem.id) ?? 0;
            discountMap.set(largestItem.id, roundToTwoDecimals(currentLargest + difference));
        }

        return discountMap;
    }

    /**
     * Executes the statutory GST calculation for the complete checkout / order.
     */
    calculateOrderGst(params: {
        sellerState: string;
        customerState: string;
        items: GstLineItemInput[];
        totalDiscount?: number;
        shippingFee?: number;
        isFreeShipping?: boolean;
        shippingGstRate?: number;
    }): GstCalculationResult {
        const pos = this.determinePlaceOfSupply(params.sellerState, params.customerState);
        const totalDiscount = roundToTwoDecimals(Math.max(0, params.totalDiscount ?? 0));
        const shippingFee = params.isFreeShipping ? 0 : roundToTwoDecimals(Math.max(0, params.shippingFee ?? 0));

        // 1. Calculate gross totals per item
        const preppedItems = params.items.map((item) => {
            const grossLineTotal = roundToTwoDecimals(item.unitPrice * item.quantity);
            return {
                ...item,
                grossLineTotal,
            };
        });

        const grossSubtotal = roundToTwoDecimals(preppedItems.reduce((sum, i) => sum + i.grossLineTotal, 0));

        // 2. Proportionally allocate order-level discount
        const discountMap = this.allocateDiscounts(
            preppedItems.map((i) => ({ id: i.id, grossTotal: i.grossLineTotal })),
            totalDiscount,
        );

        // 3. Compute tax for each line item
        const calculatedItems: CalculatedGstLineItem[] = [];
        let itemsTaxableSum = 0;
        let itemsCgstSum = 0;
        let itemsSgstSum = 0;
        let itemsIgstSum = 0;
        let itemsCessSum = 0;

        for (const item of preppedItems) {
            const allocatedDiscount = discountMap.get(item.id) ?? 0;
            const isInclusive = Boolean(item.isInclusive);
            const treatment = item.taxTreatment ?? "TAXABLE";

            // Determine rates based on Place of Supply
            let cgstRate = 0;
            let sgstRate = 0;
            let igstRate = 0;
            const cessRate = item.cessRate ?? 0;

            if (treatment === "TAXABLE") {
                if (pos.isInterState) {
                    igstRate = item.igstRate !== undefined ? item.igstRate : item.taxRate;
                } else {
                    cgstRate = item.cgstRate !== undefined ? item.cgstRate : roundToTwoDecimals(item.taxRate / 2);
                    sgstRate = item.sgstRate !== undefined ? item.sgstRate : roundToTwoDecimals(item.taxRate / 2);
                }
            }

            const totalRate = cgstRate + sgstRate + igstRate + cessRate;

            // Calculate Net Taxable Value
            let netTaxableAmount = 0;
            let cgstAmount = 0;
            let sgstAmount = 0;
            let igstAmount = 0;
            let cessAmount = 0;

            if (isInclusive) {
                // Inclusive: price includes GST: Taxable = (Gross - Discount) / (1 + Rate / 100)
                const discountedGross = Math.max(0, item.grossLineTotal - allocatedDiscount);
                netTaxableAmount = roundToTwoDecimals(discountedGross / (1 + totalRate / 100));
            } else {
                // Exclusive: price is net: Taxable = Gross - Discount
                netTaxableAmount = roundToTwoDecimals(Math.max(0, item.grossLineTotal - allocatedDiscount));
            }

            if (treatment === "TAXABLE" && netTaxableAmount > 0) {
                if (pos.isInterState) {
                    igstAmount = roundToTwoDecimals((netTaxableAmount * igstRate) / 100);
                } else {
                    cgstAmount = roundToTwoDecimals((netTaxableAmount * cgstRate) / 100);
                    sgstAmount = roundToTwoDecimals((netTaxableAmount * sgstRate) / 100);
                }
                if (cessRate > 0) {
                    cessAmount = roundToTwoDecimals((netTaxableAmount * cessRate) / 100);
                }
            }

            const totalTaxAmount = roundToTwoDecimals(cgstAmount + sgstAmount + igstAmount + cessAmount);
            const finalLineTotal = isInclusive
                ? roundToTwoDecimals(item.grossLineTotal - allocatedDiscount)
                : roundToTwoDecimals(netTaxableAmount + totalTaxAmount);

            itemsTaxableSum += netTaxableAmount;
            itemsCgstSum += cgstAmount;
            itemsSgstSum += sgstAmount;
            itemsIgstSum += igstAmount;
            itemsCessSum += cessAmount;

            calculatedItems.push({
                id: item.id,
                productId: item.productId,
                productName: item.productName,
                sku: item.sku ?? null,
                hsnCode: item.hsnCode,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                grossLineTotal: item.grossLineTotal,
                allocatedDiscount,
                netTaxableAmount,
                taxTreatment: treatment,
                cgstRate,
                sgstRate,
                igstRate,
                cessRate,
                cgstAmount,
                sgstAmount,
                igstAmount,
                cessAmount,
                totalTaxAmount,
                finalLineTotal,
                isInclusive,
                gstRuleId: item.gstRuleId ?? null,
            });
        }

        // 4. Compute shipping GST (statutory rate resolved for SAC 9968, 0 if exempt/unspecified)
        const shippingGstRate = params.shippingGstRate ?? 0;
        let shippingCgstRate = 0;
        let shippingSgstRate = 0;
        let shippingIgstRate = 0;

        let shippingCgstAmount = 0;
        let shippingSgstAmount = 0;
        let shippingIgstAmount = 0;

        if (shippingFee > 0) {
            if (pos.isInterState) {
                shippingIgstRate = shippingGstRate;
                shippingIgstAmount = roundToTwoDecimals((shippingFee * shippingIgstRate) / 100);
            } else {
                shippingCgstRate = roundToTwoDecimals(shippingGstRate / 2);
                shippingSgstRate = roundToTwoDecimals(shippingGstRate / 2);
                shippingCgstAmount = roundToTwoDecimals((shippingFee * shippingCgstRate) / 100);
                shippingSgstAmount = roundToTwoDecimals((shippingFee * shippingSgstRate) / 100);
            }
        }

        const shippingTaxAmount = roundToTwoDecimals(shippingCgstAmount + shippingSgstAmount + shippingIgstAmount);

        const shippingCalc: GstShippingCalculation = {
            shippingFee,
            taxableAmount: shippingFee,
            sacCode: GstEngineService.DEFAULT_SHIPPING_SAC,
            gstRate: shippingGstRate,
            cgstRate: shippingCgstRate,
            sgstRate: shippingSgstRate,
            igstRate: shippingIgstRate,
            cgstAmount: shippingCgstAmount,
            sgstAmount: shippingSgstAmount,
            igstAmount: shippingIgstAmount,
            totalTaxAmount: shippingTaxAmount,
            finalShippingTotal: roundToTwoDecimals(shippingFee + shippingTaxAmount),
        };

        // 5. Aggregate order-level financial totals
        const totalTaxableAmount = roundToTwoDecimals(itemsTaxableSum + shippingFee);
        const totalCgstAmount = roundToTwoDecimals(itemsCgstSum + shippingCgstAmount);
        const totalSgstAmount = roundToTwoDecimals(itemsSgstSum + shippingSgstAmount);
        const totalIgstAmount = roundToTwoDecimals(itemsIgstSum + shippingIgstAmount);
        const totalCessAmount = roundToTwoDecimals(itemsCessSum);
        const totalTaxAmount = roundToTwoDecimals(totalCgstAmount + totalSgstAmount + totalIgstAmount + totalCessAmount);

        const grandTotal = roundToTwoDecimals(
            grossSubtotal - totalDiscount + shippingCalc.finalShippingTotal + (preppedItems.some((i) => !i.isInclusive) ? (totalCgstAmount + totalSgstAmount + totalIgstAmount + totalCessAmount - shippingTaxAmount) : 0),
        );

        return {
            placeOfSupply: pos,
            items: calculatedItems,
            shipping: shippingCalc,
            totals: {
                grossSubtotal,
                totalDiscount,
                totalTaxableAmount,
                totalCgstAmount,
                totalSgstAmount,
                totalIgstAmount,
                totalCessAmount,
                totalTaxAmount,
                shippingTotal: shippingCalc.finalShippingTotal,
                grandTotal: Math.max(0, grandTotal),
            },
            calculationVersion: GstEngineService.CALCULATION_VERSION,
            calculatedAt: new Date().toISOString(),
        };
    }
}

export const gstEngineService = new GstEngineService();
