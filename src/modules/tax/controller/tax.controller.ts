import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { AppError } from "@/common/errors/app-error.js";
import { gstEngineService, type GstLineItemInput } from "../services/gstEngine.service.js";
import { taxRuleService } from "../services/taxRule.service.js";
import { sellerTaxService } from "../services/sellerTax.service.js";
import { invoiceService } from "../services/invoice.service.js";
import { prisma } from "@/lib/prisma.js";
import {
    taxQuoteSchema,
    createTaxClassificationSchema,
    updateClassificationStatusSchema,
    createGstRuleSchema,
    upsertSellerProfileSchema,
} from "../validations/tax.validation.js";

export class TaxController {
    /**
     * Customer quote endpoint: previews detailed statutory GST calculation for cart or provided items.
     * Route: POST /api/v1/tax/quote
     */
    async getTaxQuote(request: FastifyRequest, reply: FastifyReply) {
        const input = taxQuoteSchema.parse(request.body);
        const sellerProfile = await sellerTaxService.getDefaultSellerProfile();

        const lineInputs: GstLineItemInput[] = [];

        if (input.items && input.items.length > 0) {
            for (const item of input.items) {
                const taxDetails = await taxRuleService.resolveProductTaxDetails(item.productId);
                const unitPrice = item.unitPrice ?? 0;

                lineInputs.push({
                    id: item.variantId || item.productId,
                    productId: item.productId,
                    productName: `Product ${item.productId}`,
                    hsnCode: taxDetails.hsnCode,
                    quantity: item.quantity,
                    unitPrice,
                    taxRate: taxDetails.combinedRate,
                    cgstRate: taxDetails.cgstRate,
                    sgstRate: taxDetails.sgstRate,
                    igstRate: taxDetails.igstRate,
                    cessRate: taxDetails.cessRate,
                    taxTreatment: taxDetails.taxTreatment,
                    gstRuleId: taxDetails.gstRuleId,
                });
            }
        } else if (input.cartId) {
            const cart = await prisma.cart.findUnique({
                where: { id: input.cartId },
                include: {
                    items: {
                        include: {
                            variant: {
                                include: { product: true },
                            },
                        },
                    },
                },
            });

            if (!cart || cart.items.length === 0) {
                throw new AppError("Cart is empty or not found", 400);
            }

            for (const item of cart.items) {
                const product = item.variant.product;
                const taxDetails = await taxRuleService.resolveProductTaxDetails(product.id);

                lineInputs.push({
                    id: item.id,
                    productId: product.id,
                    productName: product.name,
                    sku: item.variant.sku,
                    hsnCode: taxDetails.hsnCode,
                    quantity: item.quantity,
                    unitPrice: Number(item.variant.price),
                    taxRate: taxDetails.combinedRate,
                    cgstRate: taxDetails.cgstRate,
                    sgstRate: taxDetails.sgstRate,
                    igstRate: taxDetails.igstRate,
                    cessRate: taxDetails.cessRate,
                    taxTreatment: taxDetails.taxTreatment,
                    gstRuleId: taxDetails.gstRuleId,
                });
            }
        } else {
            throw new AppError("Either cartId or items array must be provided", 400);
        }

        const shippingRule = await taxRuleService.resolveApplicableRule("9968");
        const shippingGstRate = shippingRule ? Number(shippingRule.igstRate) : undefined;

        const calculation = gstEngineService.calculateOrderGst({
            sellerState: sellerProfile.stateCode,
            customerState: input.shippingAddress.state,
            items: lineInputs,
            totalDiscount: input.totalDiscount,
            shippingFee: input.shippingFee,
            isFreeShipping: input.isFreeShipping,
            ...(shippingGstRate !== undefined && { shippingGstRate }),
        });

        return sendOk({
            reply,
            message: "Tax quote calculated successfully",
            data: {
                sellerGstin: sellerProfile.gstin,
                sellerTradeName: sellerProfile.tradeName,
                customerGstin: input.customerGstin ?? null,
                ...calculation,
            },
        });
    }

    /**
     * Generates or fetches an immutable GST Tax Invoice for an order.
     * Route: GET /api/v1/orders/:id/invoice
     */
    async getOrderTaxInvoice(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const userId = request.user?.id;
        const isAdmin = Boolean(
            request.user?.roles?.includes("SUPER_ADMIN") ||
            request.user?.permissions?.includes("order:read"),
        );

        const invoice = await invoiceService.generateTaxInvoice(id, userId, isAdmin);

        return sendOk({
            reply,
            message: "Tax invoice generated successfully",
            data: invoice,
        });
    }

    // ----------------------------------------------------
    // Admin: Tax Classifications
    // ----------------------------------------------------
    async createClassification(request: FastifyRequest, reply: FastifyReply) {
        const input = createTaxClassificationSchema.parse(request.body);
        const adminId = request.user?.id;
        const result = await taxRuleService.createClassification(input, adminId);

        return sendCreated({
            reply,
            message: "Tax classification created successfully",
            data: result,
        });
    }

    async updateClassificationStatus(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const { verificationStatus } = updateClassificationStatusSchema.parse(request.body);
        const adminId = request.user?.id;

        const result = await taxRuleService.updateClassificationStatus(id, verificationStatus, adminId);

        return sendOk({
            reply,
            message: `Tax classification updated to ${verificationStatus}`,
            data: result,
        });
    }

    async listClassifications(request: FastifyRequest, reply: FastifyReply) {
        const query = request.query as any;
        const result = await taxRuleService.listClassifications({
            search: query?.search,
            verificationStatus: query?.status,
            page: query?.page ? Number(query.page) : 1,
            limit: query?.limit ? Number(query.limit) : 50,
        });

        return sendOk({
            reply,
            message: "Tax classifications retrieved successfully",
            data: result,
        });
    }

    // ----------------------------------------------------
    // Admin: Statutory GST Rules
    // ----------------------------------------------------
    async createDraftRule(request: FastifyRequest, reply: FastifyReply) {
        const input = createGstRuleSchema.parse(request.body);
        const adminId = request.user?.id;

        const result = await taxRuleService.createDraftRule(input, adminId);

        return sendCreated({
            reply,
            message: "Draft GST rule created successfully",
            data: result,
        });
    }

    async approveRule(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const { reason } = (request.body as any) || {};
        const adminId = request.user?.id;

        const result = await taxRuleService.approveRule(id, adminId, reason);

        return sendOk({
            reply,
            message: "GST rule approved successfully",
            data: result,
        });
    }

    async publishRule(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const adminId = request.user?.id;

        const result = await taxRuleService.publishRule(id, adminId);

        return sendOk({
            reply,
            message: `GST rule published successfully with status "${result.status}"`,
            data: result,
        });
    }

    async retireRule(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const { reason } = (request.body as any) || {};
        const adminId = request.user?.id;

        const result = await taxRuleService.retireRule(id, adminId, reason);

        return sendOk({
            reply,
            message: "GST rule retired successfully",
            data: result,
        });
    }

    async listGstRules(request: FastifyRequest, reply: FastifyReply) {
        const query = request.query as any;
        const rules = await prisma.gstRule.findMany({
            where: {
                ...(query?.hsnCode ? { hsnCode: query.hsnCode } : {}),
                ...(query?.status ? { status: query.status } : {}),
            },
            orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
            include: {
                taxClassification: true,
                audits: {
                    orderBy: { createdAt: "desc" },
                    take: 5,
                },
            },
        });

        return sendOk({
            reply,
            message: "GST rules retrieved successfully",
            data: rules,
        });
    }

    async seedDefaultRules(request: FastifyRequest, reply: FastifyReply) {
        await taxRuleService.seedStandardTaxClassificationsAndRules();
        await sellerTaxService.getDefaultSellerProfile();

        return sendOk({
            reply,
            message: "Standard CBIC GST rules and default seller profile initialized successfully",
        });
    }

    // ----------------------------------------------------
    // Seller Tax Profiles
    // ----------------------------------------------------
    async getDefaultSellerProfile(request: FastifyRequest, reply: FastifyReply) {
        const profile = await sellerTaxService.getDefaultSellerProfile();
        return sendOk({
            reply,
            message: "Default seller tax profile retrieved",
            data: profile,
        });
    }

    async upsertSellerProfile(request: FastifyRequest, reply: FastifyReply) {
        const input = upsertSellerProfileSchema.parse(request.body);
        const result = await sellerTaxService.upsertSellerProfile(input);

        return sendOk({
            reply,
            message: "Seller tax profile saved successfully",
            data: result,
        });
    }

    async listSellerProfiles(request: FastifyRequest, reply: FastifyReply) {
        const profiles = await sellerTaxService.listSellerProfiles();
        return sendOk({
            reply,
            message: "Seller tax profiles retrieved successfully",
            data: profiles,
        });
    }
}

export const taxController = new TaxController();
