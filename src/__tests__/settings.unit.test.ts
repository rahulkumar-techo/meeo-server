import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingService } from "@/modules/settings/services/setting.service.js";
import { SystemSettingsSchema } from "@/modules/settings/validations/setting.validation.js";

describe("System Settings Unit Tests", () => {
    let settingService: SettingService;

    beforeEach(() => {
        settingService = new SettingService();
    });

    it("parses and validates default system settings across all 3 tiers", () => {
        const defaults = SystemSettingsSchema.parse({});

        // Tier 1
        expect(defaults.platformBrandName).toBe("E-Commerce Platform");
        expect(defaults.publicDomainUrl).toBe("https://store.example.com");
        expect(defaults.supportEmail).toBe("support@example.com");
        expect(defaults.defaultCurrency).toBe("USD");
        expect(defaults.timezone).toBe("UTC");
        expect(defaults.requireAdmin2FA).toBe(false);

        // Operational controls
        expect(defaults.maintenanceMode).toBe(false);
        expect(defaults.readOnlyMode).toBe(false);
        expect(defaults.disableCheckout).toBe(false);
        expect(defaults.disablePayments).toBe(false);

        // Rate limits
        expect(defaults.globalApiRateLimit).toBe(100);
        expect(defaults.loginRateLimit).toBe(5);
        expect(defaults.checkoutRateLimit).toBe(10);

        // Tier 2: Financial rules
        expect(defaults.settlementFrequency).toBe("WEEKLY");
        expect(defaults.settlementDelayDays).toBe(2);
        expect(defaults.minimumPayoutAmount).toBe(50.00);
        expect(defaults.reservePercentage).toBe(5.0);
        expect(defaults.refundApprovalThreshold).toBe(500.00);
        expect(defaults.automatedPayouts).toBe(true);

        // Tier 3: Advanced
        expect(defaults.allowedMaintenanceIps).toEqual([]);
        expect(defaults.emergencyControls.killSwitchActive).toBe(false);
        expect(defaults.dataRetentionDays).toBe(365);
    });

    it("updates settings and merges with existing cache", async () => {
        const updated = await settingService.updateSettings({
            platformBrandName: "Nexus Commerce",
            settlementFrequency: "DAILY",
            refundApprovalThreshold: 250.00,
        });

        expect(updated.platformBrandName).toBe("Nexus Commerce");
        expect(updated.settlementFrequency).toBe("DAILY");
        expect(updated.refundApprovalThreshold).toBe(250.00);
        expect(updated.supportEmail).toBe("support@example.com"); // Unchanged default preserved
    });

    it("toggles emergency kill switch and freezes checkout/payments", async () => {
        const result = await settingService.toggleEmergencyKillSwitch({
            killSwitchActive: true,
            emergencyMessage: "Emergency security audit in progress",
        });

        expect(result.emergencyControls.killSwitchActive).toBe(true);
        expect(result.emergencyControls.emergencyMessage).toBe("Emergency security audit in progress");
        expect(result.maintenanceMode).toBe(true);
        expect(result.disableCheckout).toBe(true);
        expect(result.disablePayments).toBe(true);
    });

    it("evaluates feature flags with deterministic canary rollout hashing", async () => {
        await settingService.updateSettings({
            featureFlags: {
                enableReviews: true,
                enableBetaFeature: false,
            },
            percentageFeatureRollout: {
                canaryRollout: 50,
            },
        });

        expect(settingService.isFeatureEnabled("enableReviews")).toBe(true);
        expect(settingService.isFeatureEnabled("enableBetaFeature")).toBe(false);

        // Deterministic canary hash
        const userA = settingService.isFeatureEnabled("canaryRollout", "user_123");
        const userARepeat = settingService.isFeatureEnabled("canaryRollout", "user_123");
        expect(userA).toBe(userARepeat);
    });
});
