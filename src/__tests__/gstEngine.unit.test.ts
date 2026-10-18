import { describe, it, expect } from "vitest";
import { gstEngineService, type GstLineItemInput } from "../modules/tax/services/gstEngine.service.js";
import { numberToIndianWords } from "../modules/tax/services/invoice.service.js";
import {
    INDIAN_GST_STATES,
    normalizeIndianState,
    isValidGstin,
    extractStateCodeFromGstin,
} from "../modules/tax/constants/indianStates.js";

describe("GST Engine Domain Unit Tests", () => {
    describe("Indian State GST Codes & GSTIN Validation", () => {
        it("contains all recognized state & UT GST codes", () => {
            expect(Object.keys(INDIAN_GST_STATES).length).toBeGreaterThanOrEqual(36);
            expect(INDIAN_GST_STATES["27"]?.name).toBe("Maharashtra");
            expect(INDIAN_GST_STATES["29"]?.name).toBe("Karnataka");
            expect(INDIAN_GST_STATES["07"]?.name).toBe("Delhi");
        });

        it("normalizes state codes by exact code, name, and case-insensitive string", () => {
            expect(normalizeIndianState("27")?.code).toBe("27");
            expect(normalizeIndianState("Maharashtra")?.code).toBe("27");
            expect(normalizeIndianState("maharashtra")?.code).toBe("27");
            expect(normalizeIndianState("Karnataka")?.code).toBe("29");
            expect(normalizeIndianState("InvalidState")).toBeNull();
        });

        it("validates 15-character statutory GSTIN structure and extracts state code", () => {
            expect(isValidGstin("27AAACM1234F1Z5")).toBe(true);
            expect(isValidGstin("29AAACM1234F1Z5")).toBe(true);
            expect(isValidGstin("12345")).toBe(false);
            expect(isValidGstin("27AAACM1234F1Z")).toBe(false); // 14 chars
            expect(extractStateCodeFromGstin("27AAACM1234F1Z5")).toBe("27");
            expect(extractStateCodeFromGstin("07AAAAA0000A1Z5")).toBe("07");
        });
    });

    describe("Place of Supply & Tax Apportionment (Intra-State vs Inter-State)", () => {
        it("applies 50% CGST and 50% SGST (0% IGST) for Intra-State supply (MH -> MH)", () => {
            const items: GstLineItemInput[] = [
                {
                    id: "item-1",
                    productId: "prod-1",
                    productName: "Mechanical Keyboard",
                    hsnCode: "84713010",
                    unitPrice: 1000,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Maharashtra",
                items,
                shippingFee: 0,
                totalDiscount: 0,
            });

            expect(result.placeOfSupply.isInterState).toBe(false);
            expect(result.placeOfSupply.customerStateCode).toBe("27");

            const item = result.items[0]!;
            expect(item.netTaxableAmount).toBe(1000);
            expect(item.cgstRate).toBe(9);
            expect(item.sgstRate).toBe(9);
            expect(item.igstRate).toBe(0);
            expect(item.cgstAmount).toBe(90);
            expect(item.sgstAmount).toBe(90);
            expect(item.igstAmount).toBe(0);
            expect(item.totalTaxAmount).toBe(180);
            expect(item.finalLineTotal).toBe(1180);

            expect(result.totals.totalCgstAmount).toBe(90);
            expect(result.totals.totalSgstAmount).toBe(90);
            expect(result.totals.totalIgstAmount).toBe(0);
            expect(result.totals.totalTaxAmount).toBe(180);
            expect(result.totals.grandTotal).toBe(1180);
        });

        it("applies 100% IGST (0% CGST, 0% SGST) for Inter-State supply (MH -> KA)", () => {
            const items: GstLineItemInput[] = [
                {
                    id: "item-1",
                    productId: "prod-1",
                    productName: "Mechanical Keyboard",
                    hsnCode: "84713010",
                    unitPrice: 1000,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Karnataka",
                items,
                shippingFee: 0,
                totalDiscount: 0,
            });

            expect(result.placeOfSupply.isInterState).toBe(true);
            expect(result.placeOfSupply.customerStateCode).toBe("29");

            const item = result.items[0]!;
            expect(item.netTaxableAmount).toBe(1000);
            expect(item.cgstRate).toBe(0);
            expect(item.sgstRate).toBe(0);
            expect(item.igstRate).toBe(18);
            expect(item.cgstAmount).toBe(0);
            expect(item.sgstAmount).toBe(0);
            expect(item.igstAmount).toBe(180);
            expect(item.totalTaxAmount).toBe(180);

            expect(result.totals.totalCgstAmount).toBe(0);
            expect(result.totals.totalSgstAmount).toBe(0);
            expect(result.totals.totalIgstAmount).toBe(180);
            expect(result.totals.grandTotal).toBe(1180);
        });
    });

    describe("GST-Inclusive vs GST-Exclusive Pricing", () => {
        it("calculates backward taxable amount for GST-inclusive price: taxable = gross / (1 + r)", () => {
            // Price = 1180 inclusive of 18% GST -> Taxable = 1000, GST = 180
            const items: GstLineItemInput[] = [
                {
                    id: "item-inc",
                    productId: "prod-inc",
                    productName: "Premium Backpack",
                    hsnCode: "4202",
                    unitPrice: 1180,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: true,
                    taxTreatment: "TAXABLE",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Maharashtra",
                items,
                shippingFee: 0,
                totalDiscount: 0,
            });

            const item = result.items[0]!;
            expect(item.grossLineTotal).toBe(1180);
            expect(item.netTaxableAmount).toBe(1000);
            expect(item.cgstAmount).toBe(90);
            expect(item.sgstAmount).toBe(90);
            expect(item.totalTaxAmount).toBe(180);
            expect(item.finalLineTotal).toBe(1180); // Final price remains 1180
            expect(result.totals.grandTotal).toBe(1180);
        });

        it("handles zero-rated and exempt goods with zero tax", () => {
            const items: GstLineItemInput[] = [
                {
                    id: "item-exempt",
                    productId: "prod-books",
                    productName: "Printed Books",
                    hsnCode: "4901",
                    unitPrice: 500,
                    quantity: 2,
                    taxRate: 0,
                    isInclusive: false,
                    taxTreatment: "EXEMPT",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Delhi",
                items,
                shippingFee: 0,
                totalDiscount: 0,
            });

            const item = result.items[0]!;
            expect(item.grossLineTotal).toBe(1000);
            expect(item.netTaxableAmount).toBe(1000);
            expect(item.totalTaxAmount).toBe(0);
            expect(item.finalLineTotal).toBe(1000);
            expect(result.totals.totalTaxAmount).toBe(0);
            expect(result.totals.grandTotal).toBe(1000);
        });
    });

    describe("Proportional Discount Allocation & Penny Reconciliation", () => {
        it("allocates order-level discount proportionally across lines and reconciles penny differences", () => {
            // Two items: Item 1 = 600, Item 2 = 400. Total = 1000.
            // Discount = 100.
            // Item 1 ratio = 600/1000 = 60% -> 60 discount.
            // Item 2 ratio = 400/1000 = 40% -> 40 discount.
            const items: GstLineItemInput[] = [
                {
                    id: "item-1",
                    productId: "p1",
                    productName: "Item One",
                    hsnCode: "8471",
                    unitPrice: 600,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
                {
                    id: "item-2",
                    productId: "p2",
                    productName: "Item Two",
                    hsnCode: "6109",
                    unitPrice: 400,
                    quantity: 1,
                    taxRate: 5,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Maharashtra",
                items,
                shippingFee: 0,
                totalDiscount: 100,
            });

            expect(result.items[0]!.allocatedDiscount).toBe(60);
            expect(result.items[1]!.allocatedDiscount).toBe(40);
            expect(result.totals.totalDiscount).toBe(100);

            // Item 1: taxable = 600 - 60 = 540. GST 18% = 97.2 (CGST 48.6, SGST 48.6)
            expect(result.items[0]!.netTaxableAmount).toBe(540);
            expect(result.items[0]!.cgstAmount).toBe(48.6);
            expect(result.items[0]!.sgstAmount).toBe(48.6);
            expect(result.items[0]!.totalTaxAmount).toBe(97.2);

            // Item 2: taxable = 400 - 40 = 360. GST 5% = 18 (CGST 9, SGST 9)
            expect(result.items[1]!.netTaxableAmount).toBe(360);
            expect(result.items[1]!.cgstAmount).toBe(9);
            expect(result.items[1]!.sgstAmount).toBe(9);
            expect(result.items[1]!.totalTaxAmount).toBe(18);

            expect(result.totals.totalTaxAmount).toBe(115.2);
            expect(result.totals.grandTotal).toBe(1015.2);
        });

        it("reconciles rounding remainder to the largest line item for odd discount allocations", () => {
            // Three items of 333 each (Total = 999). Discount = 100.
            const items: GstLineItemInput[] = [
                {
                    id: "item-1",
                    productId: "p1",
                    productName: "P1",
                    hsnCode: "8471",
                    unitPrice: 333,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
                {
                    id: "item-2",
                    productId: "p2",
                    productName: "P2",
                    hsnCode: "8471",
                    unitPrice: 333,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
                {
                    id: "item-3",
                    productId: "p3",
                    productName: "P3",
                    hsnCode: "8471",
                    unitPrice: 333,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Maharashtra",
                items,
                shippingFee: 0,
                totalDiscount: 100,
            });

            const sumDiscounts = result.items.reduce((acc, it) => acc + it.allocatedDiscount, 0);
            expect(Math.round(sumDiscounts * 100) / 100).toBe(100);
            expect(result.totals.totalDiscount).toBe(100);
        });
    });

    describe("Taxable Shipping Fee (SAC 9968)", () => {
        it("computes 18% GST on shipping fee and breaks down CGST/SGST intra-state", () => {
            const items: GstLineItemInput[] = [
                {
                    id: "item-1",
                    productId: "p1",
                    productName: "Item 1",
                    hsnCode: "8471",
                    unitPrice: 1000,
                    quantity: 1,
                    taxRate: 18,
                    isInclusive: false,
                    taxTreatment: "TAXABLE",
                },
            ];

            const result = gstEngineService.calculateOrderGst({
                sellerState: "Maharashtra",
                customerState: "Maharashtra",
                items,
                shippingFee: 100,
                shippingGstRate: 18,
                totalDiscount: 0,
            });

            expect(result.shipping.taxableAmount).toBe(100);
            expect(result.shipping.gstRate).toBe(18);
            expect(result.shipping.sacCode).toBe("9968");
            expect(result.shipping.cgstAmount).toBe(9);
            expect(result.shipping.sgstAmount).toBe(9);
            expect(result.shipping.igstAmount).toBe(0);
            expect(result.shipping.totalTaxAmount).toBe(18);
            expect(result.shipping.finalShippingTotal).toBe(118);

            // Item total = 1180, Shipping total = 118 -> Final = 1298
            expect(result.totals.totalTaxAmount).toBe(198); // 180 + 18
            expect(result.totals.grandTotal).toBe(1298);
        });
    });

    describe("Indian Currency Words Formatter (Rule 46 Invoice Compliance)", () => {
        it("converts amounts to standard Indian numbering words (Lakhs, Crores, Paise)", () => {
            expect(numberToIndianWords(0)).toBe("Zero Rupees Only");
            expect(numberToIndianWords(100)).toBe("Rupees One Hundred Only");
            expect(numberToIndianWords(1180)).toBe("Rupees One Thousand One Hundred and Eighty Only");
            expect(numberToIndianWords(125400)).toBe("Rupees One Lakh Twenty Five Thousand Four Hundred Only");
            expect(numberToIndianWords(150.50)).toBe("Rupees One Hundred and Fifty and Fifty Paise Only");
            expect(numberToIndianWords(10000000)).toBe("Rupees One Crore Only");
        });
    });
});
