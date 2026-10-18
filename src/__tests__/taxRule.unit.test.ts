import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
