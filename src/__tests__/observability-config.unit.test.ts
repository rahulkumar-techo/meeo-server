import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    observabilityConfigService,
    DEFAULT_OBSERVABILITY_CONFIGS,
} from "@/modules/observability/services/observabilityConfig.service.js";
import { prisma } from "@/lib/prisma.js";

describe("ObservabilityConfigService (L1/L2 Cache & DB Protection)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("seeds default configurations when database is cold", async () => {
        const configs = await observabilityConfigService.getAllConfigs();

        expect(configs).toBeDefined();
        expect(configs.length).toBeGreaterThanOrEqual(DEFAULT_OBSERVABILITY_CONFIGS.length);

        const serverConfig = configs.find((c) => c.key === "thresholds:server_5xx");
        expect(serverConfig).toBeDefined();
        expect(serverConfig?.value.warningRatePercent).toBe(2.0);
        expect(serverConfig?.value.criticalRatePercent).toBe(5.0);
    });

    it("serves subsequent reads directly from in-memory L1 cache without DB queries", async () => {
        // Spy on prisma.observabilityConfig.findMany to verify DB is NOT called repeatedly
        const findManySpy = vi.spyOn(prisma.observabilityConfig, "findMany");

        // Warm up cache
        await observabilityConfigService.getAllConfigs();

        findManySpy.mockClear();

        // Second call should hit L1 memory
        const cachedConfigs = await observabilityConfigService.getAllConfigs();
        expect(cachedConfigs).toBeDefined();
        expect(findManySpy).not.toHaveBeenCalled();

        findManySpy.mockRestore();
    });

    it("fetches single configuration item by key", async () => {
        const config = await observabilityConfigService.getConfig("thresholds:client_4xx");
        expect(config).toBeDefined();
        expect(config?.category).toBe("client_errors");
        expect(config?.value.monitoredStatusCodes).toContain(404);
    });

    it("updates configuration, persists to DB and updates in-memory cache", async () => {
        const updated = await observabilityConfigService.updateConfig(
            "thresholds:server_5xx",
            {
                value: {
                    warningRatePercent: 3.5,
                },
            },
        );

        expect(updated.value.warningRatePercent).toBe(3.5);
        expect(updated.value.criticalRatePercent).toBe(5.0); // Preserved

        // Immediate subsequent get should reflect the new value from L1
        const readBack = await observabilityConfigService.getConfig("thresholds:server_5xx");
        expect(readBack?.value.warningRatePercent).toBe(3.5);
    });

    it("resets configurations back to baseline defaults", async () => {
        const resetItems = await observabilityConfigService.resetToDefaults();
        const serverConfig = resetItems.find((c) => c.key === "thresholds:server_5xx");
        expect(serverConfig?.value.warningRatePercent).toBe(2.0);
    });
});
