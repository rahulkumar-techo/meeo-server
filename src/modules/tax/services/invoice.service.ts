import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { sellerTaxService } from "./sellerTax.service.js";

/**
 * Converts a positive monetary number into English words (Indian numbering system).
 */
export function numberToIndianWords(amount: number): string {
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const whole = Math.floor(amount);
    const paise = Math.round((amount - whole) * 100);

    if (whole === 0) return paise > 0 ? `${paise}/100 Only` : "Zero Rupees Only";

    function convertTwoDigits(n: number): string {
        if (n < 10) return units[n] ?? "";
        if (n >= 10 && n < 20) return teens[n - 10] ?? "";
        const t = Math.floor(n / 10);
        const rem = n % 10;
        return `${tens[t] ?? ""}${rem > 0 ? " " + (units[rem] ?? "") : ""}`;
    }

    function convertThreeDigits(n: number): string {
        const hundred = Math.floor(n / 100);
        const rest = n % 100;
        let str = "";
        if (hundred > 0) str += `${units[hundred]} Hundred`;
        if (rest > 0) str += `${str.length > 0 ? " and " : ""}${convertTwoDigits(rest)}`;
        return str;
    }

    let remaining = whole;
    let parts: string[] = [];

    // Crore (1,00,00,000)
    const crore = Math.floor(remaining / 10000000);
    remaining %= 10000000;
    if (crore > 0) parts.push(`${convertTwoDigits(crore)} Crore`);

    // Lakh (1,00,000)
    const lakh = Math.floor(remaining / 100000);
    remaining %= 100000;
    if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);

    // Thousand (1,000)
    const thousand = Math.floor(remaining / 1000);
    remaining %= 1000;
    if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);

    // Hundreds & units
    if (remaining > 0) parts.push(convertThreeDigits(remaining));

    let result = `Rupees ${parts.join(" ")}`;
    if (paise > 0) {
        result += ` and ${convertTwoDigits(paise)} Paise`;
    }
    result += " Only";

    return result;
}

export class InvoiceService {
    /**
     * Generates a complete, statutory Indian GST Tax Invoice data model
     * conforming to Rule 46 of the Central Goods and Services Tax (CGST) Rules, 2017.
     */
    async generateTaxInvoice(orderId: string, requestedByUserId?: string, isAdmin: boolean = false) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                address: true,
                items: {
                    include: {
                        taxSnapshot: true,
                    },
                },
                taxSnapshot: {
                    include: {
                        sellerProfile: true,
                    },
                },
                payments: {
                    where: { status: "SUCCESS" },
                    take: 1,
                },
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (!isAdmin && order.userId && order.userId !== requestedByUserId) {
            throw new AppError("Unauthorized access to this order invoice", 403);
        }

        const defaultSeller = await sellerTaxService.getDefaultSellerProfile();
        const snapshot = order.taxSnapshot;

        const supplier = {
            legalName: snapshot?.sellerLegalName || defaultSeller.legalBusinessName,
            tradeName: snapshot?.sellerTradeName || defaultSeller.tradeName,
            gstin: snapshot?.sellerGstin || defaultSeller.gstin,
            stateCode: snapshot?.sellerStateCode || defaultSeller.stateCode,
            stateName: defaultSeller.stateName,
            address: defaultSeller.addressLine1 + (defaultSeller.addressLine2 ? `, ${defaultSeller.addressLine2}` : ""),
            city: defaultSeller.city,
            postalCode: defaultSeller.postalCode,
        };

        const recipient = {
            name: order.address?.recipientName || "Valued Customer",
            phone: order.address?.phone || null,
            address: `${order.address?.addressLine1 || ""}${order.address?.addressLine2 ? ", " + order.address.addressLine2 : ""}`,
            city: order.address?.city || "",
            state: order.address?.state || "",
            stateCode: snapshot?.placeOfSupplyStateCode || "27",
            postalCode: order.address?.postalCode || "",
            customerGstin: snapshot?.customerGstin || null,
        };

        const placeOfSupply = {
            stateCode: snapshot?.placeOfSupplyStateCode || "27",
            stateName: snapshot?.placeOfSupplyStateName || order.address?.state || "Maharashtra",
            isInterState: snapshot ? snapshot.isInterState : false,
        };

        const invoiceNumber = `INV-${order.orderNumber}`;
        const invoiceDate = order.createdAt.toISOString();

        // Line item details
        const invoiceItems = order.items.map((item, idx) => {
            const itemSnap = item.taxSnapshot;
            const gross = Number(item.unitPrice) * item.quantity;
            const discount = itemSnap ? Number(itemSnap.allocatedDiscountAmount) : Number(item.discountTotal);
            const taxable = itemSnap ? Number(itemSnap.netTaxableAmount) : Math.max(0, gross - discount);

            return {
                serialNumber: idx + 1,
                itemId: item.id,
                productName: item.productName,
                sku: item.sku,
                hsnCode: itemSnap?.hsnCode || (item as any).hsnCode || "UNCLASSIFIED",
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                grossAmount: gross,
                discountAmount: discount,
                taxableAmount: taxable,
                cgstRate: itemSnap ? Number(itemSnap.cgstRate) : 0,
                cgstAmount: itemSnap ? Number(itemSnap.cgstAmount) : 0,
                sgstRate: itemSnap ? Number(itemSnap.sgstRate) : 0,
                sgstAmount: itemSnap ? Number(itemSnap.sgstAmount) : 0,
                igstRate: itemSnap ? Number(itemSnap.igstRate) : 0,
                igstAmount: itemSnap ? Number(itemSnap.igstAmount) : 0,
                cessAmount: itemSnap ? Number(itemSnap.cessAmount) : 0,
                totalTaxAmount: itemSnap ? Number(itemSnap.totalTaxAmount) : Number(item.taxTotal),
                lineTotal: itemSnap ? Number(item.total) : Number(item.total),
            };
        });

        // Shipping row
        const shippingCharge = {
            description: "Shipping and Freight Delivery Service",
            sacCode: "9968",
            taxableAmount: snapshot ? Number(snapshot.shippingTaxableAmount) : Number(order.shippingTotal),
            gstRate: snapshot ? Number(snapshot.shippingGstRate) : 0,
            cgstAmount: snapshot ? Number(snapshot.shippingCgstAmount) : 0,
            sgstAmount: snapshot ? Number(snapshot.shippingSgstAmount) : 0,
            igstAmount: snapshot ? Number(snapshot.shippingIgstAmount) : 0,
            totalTaxAmount: snapshot
                ? Number(snapshot.shippingCgstAmount) + Number(snapshot.shippingSgstAmount) + Number(snapshot.shippingIgstAmount)
                : 0,
            totalShipping: Number(order.shippingTotal),
        };

        const totals = {
            subtotal: Number(order.subtotal),
            totalDiscount: Number(order.discountTotal),
            totalTaxableAmount: snapshot ? Number(snapshot.totalTaxableAmount) : Number(order.subtotal) - Number(order.discountTotal),
            totalCgstAmount: snapshot ? Number(snapshot.totalCgstAmount) : 0,
            totalSgstAmount: snapshot ? Number(snapshot.totalSgstAmount) : 0,
            totalIgstAmount: snapshot ? Number(snapshot.totalIgstAmount) : 0,
            totalCessAmount: snapshot ? Number(snapshot.totalCessAmount) : 0,
            totalTaxAmount: Number(order.taxTotal),
            shippingTotal: Number(order.shippingTotal),
            grandTotal: Number(order.grandTotal),
            currency: order.currency,
            amountInWords: numberToIndianWords(Number(order.grandTotal)),
        };

        return {
            documentType: "TAX INVOICE",
            complianceRule: "Rule 46, CGST Rules 2017",
            invoiceNumber,
            invoiceDate,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            reverseChargeApplicable: false,
            supplier,
            recipient,
            placeOfSupply,
            items: invoiceItems,
            shipping: shippingCharge,
            totals,
            paymentSummary: order.payments?.[0] ? {
                paymentMethod: order.payments[0].paymentMethod,
                provider: order.payments[0].provider,
                transactionStatus: order.payments[0].status,
                paidAmount: Number(order.payments[0].paidAmount),
            } : null,
            footerNotes: "This is a computer-generated tax invoice. No physical signature is required under IT Act 2000.",
        };
    }
}

export const invoiceService = new InvoiceService();
