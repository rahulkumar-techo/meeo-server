import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// In-memory data store for isolated unit testing without external database dependency
const { mockPrisma, classifications, rules, audits } = vi.hoisted(() => {
    const classifications = new Map<string, any>();
    const rules = new Map<string, any>();
    const audits: any[] = [];

    const mockPrisma = {
        taxClassification: {
            findUnique: vi.fn(async ({ where }: any) => {
                if (where.hsnCode) return classifications.get(where.hsnCode) || null;
                if (where.id) {
                    for (const c of classifications.values()) {
                        if (c.id === where.id) return c;
                    }
                }
                return null;
            }),
            create: vi.fn(async ({ data }: any) => {
                const item = { id: "tc-" + data.hsnCode, createdAt: new Date(), updatedAt: new Date(), ...data };
                classifications.set(data.hsnCode, item);
                return item;
            }),
            deleteMany: vi.fn(async () => {
                classifications.clear();
                return { count: 0 };
            }),
        },
        gstRule: {
            findFirst: vi.fn(async ({ where }: any) => {
                for (const r of rules.values()) {
                    if (r.hsnCode === where.hsnCode && (!where.status || r.status === where.status)) {
                        return r;
                    }
                }
                return null;
            }),
            findMany: vi.fn(async ({ where }: any) => {
                const result: any[] = [];
                for (const r of rules.values()) {
                    if (where?.hsnCode && r.hsnCode !== where.hsnCode) continue;
                    if (where?.status && r.status !== where.status) continue;
                    result.push(r);
                }
                return result;
            }),
            findUnique: vi.fn(async ({ where }: any) => rules.get(where.id) || null),
            create: vi.fn(async ({ data }: any) => {
                const id = data.id || "rule-" + Math.random().toString(36).slice(2, 9);
                const item = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
                rules.set(id, item);
                return item;
            }),
            update: vi.fn(async ({ where, data }: any) => {
                const existing = rules.get(where.id);
                if (!existing) throw new Error("Rule not found");
                const updated = { ...existing, ...data, updatedAt: new Date() };
                rules.set(where.id, updated);
                return updated;
            }),
            updateMany: vi.fn(async ({ where, data }: any) => {
                let count = 0;
                for (const [id, r] of rules.entries()) {
                    if (where?.hsnCode && r.hsnCode !== where.hsnCode) continue;
                    if (where?.status && r.status !== where.status) continue;
                    if (where?.id?.not && r.id === where.id.not) continue;
                    rules.set(id, { ...r, ...data, updatedAt: new Date() });
                    count++;
                }
                return { count };
            }),
            deleteMany: vi.fn(async () => {
                rules.clear();
                return { count: 0 };
            }),
        },
        gstRuleAudit: {
            create: vi.fn(async ({ data }: any) => {
                const item = { id: "audit-" + Math.random().toString(36).slice(2, 9), createdAt: new Date(), ...data };
                audits.push(item);
                return item;
            }),
            findMany: vi.fn(async ({ where }: any) => {
                if (where?.ruleId) {
                    return audits.filter((a) => a.ruleId === where.ruleId);
                }
                return audits;
            }),
            deleteMany: vi.fn(async () => {
                audits.length = 0;
                return { count: 0 };
            }),
        },
        user: {
            findFirst: vi.fn(async () => ({ id: "admin-user-id", email: "admin@meeo.com" })),
        },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };

    return { mockPrisma, classifications, rules, audits };
});

vi.mock("@/lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

import { prisma } from "../lib/prisma.js";
import { taxRuleService } from "../modules/tax/services/taxRule.service.js";
import { AppError } from "../common/errors/app-error.js";

describe("Tax Rule Management & Statutory Lifecycle Tests", () => {
    let testAdminUserId: string | undefined = undefined;

    beforeAll(async () => {
        // Ensure default CBIC seeds are in place
        await taxRuleService.seedStandardTaxClassificationsAndRules();

        // Retrieve or create an admin/user for FK compatibility
        const existingUser = await prisma.user.findFirst();
        if (existingUser) {
            testAdminUserId = existingUser.id;
        }
    });

    afterAll(async () => {
        // Clean up test rules
        try {
            await prisma.gstRuleAudit.deleteMany({
                where: { rule: { hsnCode: "99999999" } },
            });
            await prisma.gstRule.deleteMany({
                where: { hsnCode: "99999999" },
            });
            await prisma.taxClassification.deleteMany({
                where: { hsnCode: "99999999" },
            });
        } catch {
            // Ignore cleanup errors
        }
    });

    it("seeds and resolves default CBIC statutory rules (e.g. 8471 IT goods @ 18% with prefix matching)", async () => {
        // 84713010 should resolve to 8471 heading rule
        const rule = await taxRuleService.resolveApplicableRule("84713010");
        expect(rule).toBeDefined();
        expect(rule?.hsnCode).toBe("8471");
        expect(Number(rule?.cgstRate)).toBe(9);
        expect(Number(rule?.sgstRate)).toBe(9);
        expect(Number(rule?.igstRate)).toBe(18);
        expect(rule?.status).toBe("ACTIVE");
    });

    it("enforces full administrative lifecycle: DRAFT -> APPROVED -> ACTIVE -> RETIRED", async () => {
        // 1. Create DRAFT rule
        const draftRule = await taxRuleService.createDraftRule(
            {
                hsnCode: "99999999",
                taxTreatment: "TAXABLE",
                cgstRate: 6,
                sgstRate: 6,
                igstRate: 12,
                effectiveFrom: new Date("2026-01-01"),
                notificationRef: "Test CBIC Notif 99/2026",
            },
            testAdminUserId,
        );

        expect(draftRule.id).toBeDefined();
        expect(draftRule.status).toBe("DRAFT");
        expect(draftRule.version).toBe(1);

        // 2. Reject direct publishing from DRAFT (must be APPROVED first)
        await expect(
            taxRuleService.publishRule(draftRule.id, testAdminUserId),
        ).rejects.toThrow(AppError);

        // 3. Transition to APPROVED
        const approvedRule = await taxRuleService.approveRule(
            draftRule.id,
            testAdminUserId,
            "Legal counsel verified CBIC notification 99/2026",
        );
        expect(approvedRule.status).toBe("APPROVED");
        if (testAdminUserId) {
            expect(approvedRule.approvedById).toBe(testAdminUserId);
        }
        expect(approvedRule.approvedAt).toBeDefined();

        // 4. Transition to ACTIVE via publish
        const publishedRule = await taxRuleService.publishRule(
            draftRule.id,
            testAdminUserId,
        );
        expect(publishedRule.status).toBe("ACTIVE");
        if (testAdminUserId) {
            expect(publishedRule.publishedById).toBe(testAdminUserId);
        }

        // 5. Verify rule resolution at current date
        const resolved = await taxRuleService.resolveApplicableRule("99999999", new Date("2026-06-01"));
        expect(resolved?.id).toBe(publishedRule.id);
        expect(Number(resolved?.igstRate)).toBe(12);

        // 6. Transition to RETIRED
        const retiredRule = await taxRuleService.retireRule(
            draftRule.id,
            testAdminUserId,
            "Superseded by amendment",
        );
        expect(retiredRule.status).toBe("RETIRED");

        // 7. Verify audit trail was recorded for all actions
        const audits = await taxRuleService.getRuleAudits(draftRule.id);
        expect(audits.length).toBeGreaterThanOrEqual(4);
    });

    it("prevents effectiveTo being before effectiveFrom on rule creation", async () => {
        await expect(
            taxRuleService.createDraftRule(
                {
                    hsnCode: "99999999",
                    taxTreatment: "TAXABLE",
                    cgstRate: 9,
                    sgstRate: 9,
                    igstRate: 18,
                    effectiveFrom: new Date("2026-12-31"),
                    effectiveTo: new Date("2026-01-01"), // Invalid: before effectiveFrom
                },
                testAdminUserId,
            ),
        ).rejects.toThrow(/effectiveTo timestamp must be strictly after effectiveFrom/i);
    });
});
