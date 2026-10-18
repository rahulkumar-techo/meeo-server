import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { Prisma } from "@/generated/prisma/client.js";

export interface CreateClassificationInput {
    hsnCode: string;
    description: string;
    category?: string | null | undefined;
    metadata?: any;
}

export interface CreateGstRuleInput {
    taxClassificationId?: string | undefined;
    hsnCode: string;
    taxTreatment?: "TAXABLE" | "NIL_RATED" | "EXEMPT" | "ZERO_RATED" | "NON_TAXABLE" | undefined;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cessRate?: number | undefined;
    effectiveFrom: string | Date;
    effectiveTo?: string | Date | null | undefined;
    notificationRef?: string | null | undefined;
    jurisdiction?: string | undefined;
}

export class TaxRuleService {
    /**
     * Resolves the legally applicable approved tax rule for an HSN code as of a specific transaction date.
     */
    async resolveApplicableRule(hsnCode: string, transactionDate: Date = new Date()) {
        if (!prisma.gstRule) {
            return null;
        }

        const cleanHsn = hsnCode.trim().replace(/\s+/g, "");
        const candidates = [cleanHsn];
        if (cleanHsn.length > 6) candidates.push(cleanHsn.slice(0, 6));
        if (cleanHsn.length > 4) candidates.push(cleanHsn.slice(0, 4));
        if (cleanHsn.length > 2) candidates.push(cleanHsn.slice(0, 2));

        for (const candidate of candidates) {
            const rules = await prisma.gstRule.findMany({
                where: {
                    hsnCode: candidate,
                    status: "ACTIVE",
                    effectiveFrom: { lte: transactionDate },
                    OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gte: transactionDate } },
                    ],
                },
                orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
            });

            if (rules.length === 0) {
                continue;
            }

            // Check for ambiguous overlapping rules
            if (rules.length > 1) {
                const first = rules[0];
                const second = rules[1];
                if (
                    first &&
                    second &&
                    (Number(first.igstRate) !== Number(second.igstRate) ||
                        first.taxTreatment !== second.taxTreatment)
                ) {
                    throw new AppError(
                        `Conflicting active GST rules found for HSN "${candidate}" as of date ${transactionDate.toISOString()}. Legal audit required.`,
                        409,
                    );
                }
            }

            return rules[0] ?? null;
        }

        return null;
    }

    /**
     * Directly resolves tax details from an in-memory product object without redundant database queries.
     */
    async resolveTaxDetailsFromProduct(product: any, transactionDate: Date = new Date()) {
        const hsnCode = product.taxClassification?.hsnCode || product.hsnCode;
        if (!hsnCode) {
            // Respect product's explicit catalog rate, or database schema default 0% (NIL_RATED) for unclassified goods
            const catalogRate = product.taxRate !== undefined && product.taxRate !== null
                ? Number(product.taxRate)
                : 0;

            return {
                hsnCode: "UNCLASSIFIED",
                taxTreatment: catalogRate > 0 ? ("TAXABLE" as const) : ("NIL_RATED" as const),
                cgstRate: Number((catalogRate / 2).toFixed(2)),
                sgstRate: Number((catalogRate / 2).toFixed(2)),
                igstRate: catalogRate,
                cessRate: 0,
                combinedRate: catalogRate,
                gstRuleId: undefined,
                notificationRef: "Unclassified Catalog Item",
                isVerified: false,
            };
        }

        const rule = await this.resolveApplicableRule(hsnCode, transactionDate);

        if (rule) {
            return {
                hsnCode: rule.hsnCode,
                taxTreatment: rule.taxTreatment,
                cgstRate: Number(rule.cgstRate),
                sgstRate: Number(rule.sgstRate),
                igstRate: Number(rule.igstRate),
                cessRate: Number(rule.cessRate),
                combinedRate: Number(rule.igstRate),
                gstRuleId: rule.id,
                notificationRef: rule.notificationRef,
                isVerified: product.taxClassification?.verificationStatus === "VERIFIED",
            };
        }

        // If no statutory rule is matched, check if an explicit verified catalog rate was provided
        if (product.taxRate !== undefined && product.taxRate !== null) {
            const catalogRate = Number(product.taxRate);
            return {
                hsnCode,
                taxTreatment: "TAXABLE" as const,
                cgstRate: Number((catalogRate / 2).toFixed(2)),
                sgstRate: Number((catalogRate / 2).toFixed(2)),
                igstRate: catalogRate,
                cessRate: 0,
                combinedRate: catalogRate,
                gstRuleId: undefined,
                notificationRef: "Unverified Product Catalog Rate",
                isVerified: false,
            };
        }

        throw new AppError(
            `No applicable GST rule or tax rate found for HSN "${hsnCode}" on product "${product.name || product.id}" as of ${transactionDate.toISOString()}. Please configure a valid GST rule.`,
            422,
        );
    }

    /**
     * Resolves classification and rule for a specific product ID.
     */
    async resolveProductTaxDetails(productId: string, transactionDate: Date = new Date()) {
        if (!prisma.product) {
            throw new AppError("Database client unavailable", 500);
        }

        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { taxClassification: true },
        });

        if (!product) {
            throw new AppError(`Product with ID "${productId}" not found`, 404);
        }

        return this.resolveTaxDetailsFromProduct(product, transactionDate);
    }

    /**
     * Creates a statutory HSN/SAC Tax Classification.
     */
    async createClassification(input: CreateClassificationInput, creatorId?: string) {
        const cleanHsn = input.hsnCode.trim().replace(/\s+/g, "");
        if (!/^\d{2,8}$/.test(cleanHsn)) {
            throw new AppError("Invalid HSN/SAC format: Must be between 2 and 8 digits", 400);
        }

        const existing = await prisma.taxClassification.findUnique({
            where: { hsnCode: cleanHsn },
        });
        if (existing) {
            throw new AppError(`Tax classification for HSN "${cleanHsn}" already exists`, 409);
        }

        return prisma.taxClassification.create({
            data: {
                hsnCode: cleanHsn,
                description: input.description,
                category: input.category ?? null,
                verificationStatus: "UNVERIFIED",
                metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
            },
        });
    }

    /**
     * Verifies or flags a Tax Classification after legal / compliance review.
     */
    async updateClassificationStatus(
        id: string,
        status: "VERIFIED" | "UNVERIFIED" | "FLAGGED_FOR_REVIEW",
        verifiedById?: string,
    ) {
        return prisma.taxClassification.update({
            where: { id },
            data: {
                verificationStatus: status,
                verifiedAt: status === "VERIFIED" ? new Date() : null,
                verifiedById: status === "VERIFIED" ? (verifiedById ?? null) : null,
            },
        });
    }

    /**
     * Lists classifications with verification filtering and search.
     */
    async listClassifications(params?: {
        search?: string;
        verificationStatus?: "VERIFIED" | "UNVERIFIED" | "FLAGGED_FOR_REVIEW";
        page?: number;
        limit?: number;
    }) {
        const page = params?.page || 1;
        const limit = params?.limit || 50;
        const skip = (page - 1) * limit;

        const where: Prisma.TaxClassificationWhereInput = {
            ...(params?.verificationStatus ? { verificationStatus: params.verificationStatus } : {}),
            ...(params?.search
                ? {
                    OR: [
                        { hsnCode: { contains: params.search, mode: "insensitive" } },
                        { description: { contains: params.search, mode: "insensitive" } },
                        { category: { contains: params.search, mode: "insensitive" } },
                    ],
                }
                : {}),
        };

        const [total, items] = await Promise.all([
            prisma.taxClassification.count({ where }),
            prisma.taxClassification.findMany({
                where,
                skip,
                take: limit,
                orderBy: { hsnCode: "asc" },
                include: {
                    rules: {
                        orderBy: { effectiveFrom: "desc" },
                    },
                },
            }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Creates a statutory GST rule in DRAFT status with audit tracking.
     */
    async createDraftRule(input: CreateGstRuleInput, actorId?: string) {
        const cleanHsn = input.hsnCode.trim().replace(/\s+/g, "");

        let classification = input.taxClassificationId
            ? await prisma.taxClassification.findUnique({ where: { id: input.taxClassificationId } })
            : await prisma.taxClassification.findUnique({ where: { hsnCode: cleanHsn } });

        if (!classification) {
            // Auto-create classification if not present
            classification = await prisma.taxClassification.create({
                data: {
                    hsnCode: cleanHsn,
                    description: `Statutory HSN ${cleanHsn} classification`,
                    verificationStatus: "UNVERIFIED",
                },
            });
        }

        const effectiveFrom = new Date(input.effectiveFrom);
        const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;

        if (effectiveTo && effectiveTo <= effectiveFrom) {
            throw new AppError("effectiveTo timestamp must be strictly after effectiveFrom", 400);
        }

        return prisma.$transaction(async (tx) => {
            const rule = await tx.gstRule.create({
                data: {
                    taxClassificationId: classification.id,
                    hsnCode: cleanHsn,
                    taxTreatment: input.taxTreatment ?? "TAXABLE",
                    cgstRate: input.cgstRate,
                    sgstRate: input.sgstRate,
                    igstRate: input.igstRate,
                    cessRate: input.cessRate ?? 0,
                    effectiveFrom,
                    effectiveTo,
                    notificationRef: input.notificationRef ?? null,
                    jurisdiction: input.jurisdiction ?? "IN",
                    status: "DRAFT",
                    version: 1,
                    createdById: actorId ?? null,
                },
            });

            await tx.gstRuleAudit.create({
                data: {
                    ruleId: rule.id,
                    action: "RULE_CREATED",
                    previousState: Prisma.DbNull,
                    newState: rule as any,
                    actorId: actorId ?? null,
                    reason: "Initial draft creation",
                    notificationRef: input.notificationRef ?? null,
                },
            });

            return rule;
        });
    }

    /**
     * Approves a DRAFT rule.
     */
    async approveRule(ruleId: string, approverId?: string, reason?: string) {
        const rule = await prisma.gstRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new AppError("GST rule not found", 404);

        if (rule.status !== "DRAFT") {
            throw new AppError(`Cannot approve rule in status "${rule.status}". Only DRAFT rules can be approved.`, 400);
        }

        return prisma.$transaction(async (tx) => {
            const updated = await tx.gstRule.update({
                where: { id: ruleId },
                data: {
                    status: "APPROVED",
                    approvedById: approverId ?? null,
                    approvedAt: new Date(),
                },
            });

            await tx.gstRuleAudit.create({
                data: {
                    ruleId: rule.id,
                    action: "RULE_APPROVED",
                    previousState: rule as any,
                    newState: updated as any,
                    actorId: approverId ?? null,
                    reason: reason || "Compliance approval granted",
                    notificationRef: rule.notificationRef,
                },
            });

            return updated;
        });
    }

    /**
     * Publishes an APPROVED or SCHEDULED rule to ACTIVE status.
     * Enforces that no overlapping active rules exist for the same HSN.
     */
    async publishRule(ruleId: string, publisherId?: string) {
        const rule = await prisma.gstRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new AppError("GST rule not found", 404);

        if (rule.status !== "APPROVED" && rule.status !== "SCHEDULED") {
            throw new AppError(
                `Cannot publish rule in "${rule.status}" status. Rule must be APPROVED first.`,
                400,
            );
        }

        const now = new Date();
        const isScheduledForFuture = rule.effectiveFrom > now;
        const targetStatus = isScheduledForFuture ? "SCHEDULED" : "ACTIVE";

        return prisma.$transaction(async (tx) => {
            // If activating immediately, retire or bound overlapping existing active rules
            if (targetStatus === "ACTIVE") {
                await tx.gstRule.updateMany({
                    where: {
                        hsnCode: rule.hsnCode,
                        status: "ACTIVE",
                        id: { not: rule.id },
                        OR: [
                            { effectiveTo: null },
                            { effectiveTo: { gt: rule.effectiveFrom } },
                        ],
                    },
                    data: {
                        effectiveTo: rule.effectiveFrom,
                        status: "RETIRED",
                    },
                });
            }

            const updated = await tx.gstRule.update({
                where: { id: ruleId },
                data: {
                    status: targetStatus,
                    publishedById: publisherId ?? null,
                    publishedAt: new Date(),
                },
            });

            await tx.gstRuleAudit.create({
                data: {
                    ruleId: rule.id,
                    action: targetStatus === "ACTIVE" ? "RULE_PUBLISHED" : "RULE_SCHEDULED",
                    previousState: rule as any,
                    newState: updated as any,
                    actorId: publisherId ?? null,
                    reason: `Published as ${targetStatus}`,
                    notificationRef: rule.notificationRef,
                },
            });

            return updated;
        });
    }

    /**
     * Retires an active or scheduled GST rule without deleting history.
     */
    async retireRule(ruleId: string, actorId?: string, reason?: string) {
        const rule = await prisma.gstRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new AppError("GST rule not found", 404);

        return prisma.$transaction(async (tx) => {
            const updated = await tx.gstRule.update({
                where: { id: ruleId },
                data: {
                    status: "RETIRED",
                    effectiveTo: rule.effectiveTo ?? new Date(),
                },
            });

            await tx.gstRuleAudit.create({
                data: {
                    ruleId: rule.id,
                    action: "RULE_RETIRED",
                    previousState: rule as any,
                    newState: updated as any,
                    actorId: actorId ?? null,
                    reason: reason || "Statutory rule retired",
                    notificationRef: rule.notificationRef,
                },
            });

            return updated;
        });
    }

    /**
     * Seeds initial verified CBIC GST tax rates and essential e-commerce HSN codes.
     */
    async seedStandardTaxClassificationsAndRules() {
        const standardData = [
            {
                hsnCode: "6109",
                description: "T-shirts, singlets and other vests, knitted or crocheted",
                category: "Apparel",
                rate: 5.0,
                notification: "CBIC Notification No. 01/2017-Central Tax (Rate)",
            },
            {
                hsnCode: "6203",
                description: "Men's or boys' suits, ensembles, jackets, trousers, bib and brace overalls",
                category: "Apparel",
                rate: 12.0,
                notification: "CBIC Notification No. 01/2017-Central Tax (Rate)",
            },
            {
                hsnCode: "8517",
                description: "Telephone sets, smartphones, and transmission apparatus for radio-telephony",
                category: "Electronics",
                rate: 18.0,
                notification: "CBIC Notification No. 01/2017-Central Tax (Rate)",
            },
            {
                hsnCode: "8471",
                description: "Automatic data processing machines, computers, laptops, and optical readers",
                category: "Computers & Peripherals",
                rate: 18.0,
                notification: "CBIC Notification No. 01/2017-Central Tax (Rate)",
            },
            {
                hsnCode: "9968",
                description: "Postal and courier services (Freight / Transportation)",
                category: "Services",
                rate: 18.0,
                notification: "CBIC Notification No. 11/2017-Central Tax (Rate)",
            },
            {
                hsnCode: "0401",
                description: "Milk and cream, not concentrated nor containing added sugar (Fresh Milk)",
                category: "Dairy & Grocery",
                rate: 0.0,
                notification: "CBIC Notification No. 02/2017-Central Tax (Rate) - Exempted Goods",
                treatment: "EXEMPT" as const,
            },
        ];

        for (const item of standardData) {
            let classification = await prisma.taxClassification.findUnique({
                where: { hsnCode: item.hsnCode },
            });

            if (!classification) {
                classification = await prisma.taxClassification.create({
                    data: {
                        hsnCode: item.hsnCode,
                        description: item.description,
                        category: item.category,
                        verificationStatus: "VERIFIED",
                        verifiedAt: new Date(),
                    },
                });
            }

            const existingRule = await prisma.gstRule.findFirst({
                where: { hsnCode: item.hsnCode, status: "ACTIVE" },
            });

            if (!existingRule) {
                const halfRate = Number((item.rate / 2).toFixed(2));
                await prisma.gstRule.create({
                    data: {
                        taxClassificationId: classification.id,
                        hsnCode: item.hsnCode,
                        taxTreatment: item.treatment || "TAXABLE",
                        cgstRate: halfRate,
                        sgstRate: halfRate,
                        igstRate: item.rate,
                        cessRate: 0,
                        effectiveFrom: new Date("2017-07-01T00:00:00Z"),
                        effectiveTo: null,
                        notificationRef: item.notification,
                        status: "ACTIVE",
                        version: 1,
                    },
                });
            }
        }
    }

    /**
     * Retrieves audit history records for a specific GST rule.
     */
    async getRuleAudits(ruleId: string) {
        return prisma.gstRuleAudit.findMany({
            where: { ruleId },
            orderBy: { createdAt: "desc" },
        });
    }
}

export const taxRuleService = new TaxRuleService();
