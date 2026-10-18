import { describe, expect, it, vi, beforeEach } from "vitest";
import { errorAlertService } from "@/modules/observability/services/errorAlert.service.js";
import { mailService } from "@/common/mail/send.mail.js";
import { observabilityConfigService } from "@/modules/observability/services/observabilityConfig.service.js";
import { systemAlertConsumer } from "@/workers/consumers/systemAlert.consumer.js";

vi.mock("@/lib/queue.js", () => ({
    publishDomainEventJob: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
}));

describe("ErrorAlertService Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        errorAlertService.reset();
        systemAlertConsumer.clearRecipientCache();
        vi.spyOn(systemAlertConsumer, "resolveAdminRecipients").mockResolvedValue([
            { email: "admin@meeo.com", name: "Administrator" },
        ]);
    });

    it("triggers alert email when 5xx errors breach the configured threshold", async () => {
        const sendMailSpy = vi.spyOn(mailService, "sendMail").mockResolvedValue({ messageId: "test-alert-id" });
        vi.spyOn(observabilityConfigService, "getConfig").mockResolvedValue({
            id: "cfg-1",
            key: "thresholds:server_5xx",
            category: "server_errors",
            value: { max5xxVolumePerMinute: 3 },
            description: "Server 5xx threshold",
            isEnabled: true,
            updatedBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        // Simulate 2 errors (below threshold of 3)
        await errorAlertService.record5xxError(new Error("Test DB error 1"), { url: "/api/v1/checkout", method: "POST" });
        await errorAlertService.record5xxError(new Error("Test DB error 2"), { url: "/api/v1/checkout", method: "POST" });
        expect(sendMailSpy).not.toHaveBeenCalled();

        // 3rd error breaches threshold -> sends alert email
        await errorAlertService.record5xxError(new Error("Test DB error 3"), { url: "/api/v1/checkout", method: "POST" });
        expect(sendMailSpy).toHaveBeenCalledTimes(1);
        expect(sendMailSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                subject: expect.stringContaining("CRITICAL ALERT"),
                text: expect.stringContaining("Test DB error 3"),
            }),
        );
    });

    it("respects cooldown period and suppresses duplicate alert emails within 15 minutes", async () => {
        const sendMailSpy = vi.spyOn(mailService, "sendMail").mockResolvedValue({ messageId: "test-alert-id" });
        vi.spyOn(observabilityConfigService, "getConfig").mockResolvedValue({
            id: "cfg-1",
            key: "thresholds:server_5xx",
            category: "server_errors",
            value: { max5xxVolumePerMinute: 1 },
            description: "Server 5xx threshold",
            isEnabled: true,
            updatedBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        // First error triggers alert
        const firstResult = await errorAlertService.record5xxError(new Error("Crash 1"), { url: "/api/v1/orders" });
        expect(firstResult).toBe(true);
        expect(sendMailSpy).toHaveBeenCalledTimes(1);

        // Subsequent errors within cooldown period are throttled
        const secondResult = await errorAlertService.record5xxError(new Error("Crash 2"), { url: "/api/v1/orders" });
        const thirdResult = await errorAlertService.record5xxError(new Error("Crash 3"), { url: "/api/v1/orders" });
        expect(secondResult).toBe(false);
        expect(thirdResult).toBe(false);
        expect(sendMailSpy).toHaveBeenCalledTimes(1);
    });

    it("supports manual threshold override and re-arms after cooldown expires", async () => {
        const sendMailSpy = vi.spyOn(mailService, "sendMail").mockResolvedValue({ messageId: "test-alert-id" });
        errorAlertService.setThresholdOverride(2);
        expect(await errorAlertService.getEffectiveThreshold()).toBe(2);

        // Error 1: below override threshold (2)
        const res1 = await errorAlertService.record5xxError(new Error("Error A"));
        expect(res1).toBe(false);
        expect(sendMailSpy).not.toHaveBeenCalled();

        // Error 2: reaches threshold -> triggers alert
        const res2 = await errorAlertService.record5xxError(new Error("Error B"));
        expect(res2).toBe(true);
        expect(sendMailSpy).toHaveBeenCalledTimes(1);

        // Fast-forward / expire cooldown
        errorAlertService.setCooldownMs(0);

        // Next error dispatches a new alert
        const res3 = await errorAlertService.record5xxError(new Error("Error C"));
        expect(res3).toBe(true);
        expect(sendMailSpy).toHaveBeenCalledTimes(2);
    });

    it("systemAlertConsumer consumes SERVER_5XX_ALERT event and renders email from template", async () => {
        const sendMailSpy = vi.spyOn(mailService, "sendMail").mockResolvedValue({ messageId: "test-alert-id" });
        const result = await systemAlertConsumer.handleEvent({
            id: "test-event-1",
            eventType: "SERVER_5XX_ALERT",
            payload: {
                count: 5,
                threshold: 5,
                errorMessage: "Simulated memory leak",
                route: "/api/v1/orders",
                method: "POST",
                timestamp: new Date().toISOString(),
                env: "production",
            },
        });

        expect(result.success).toBe(true);
        expect(result.dispatchedCount).toBeGreaterThan(0);
        expect(sendMailSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                subject: expect.stringContaining("5 Server 5xx Errors/Min on PRODUCTION"),
                html: expect.stringContaining("Simulated memory leak"),
            }),
        );
    });

    it("dynamically resolves alert cooldown from polling policy and reflects in dispatched email", async () => {
        const sendMailSpy = vi.spyOn(mailService, "sendMail").mockResolvedValue({ messageId: "dynamic-cooldown-id" });
        vi.spyOn(observabilityConfigService, "getPollingPolicy").mockResolvedValue({
            allowedWindows: ["15m", "1h", "6h", "24h"],
            activeWindow: "15m",
            allowedIntervals: ["5s", "15s", "30s", "Off"],
            activeInterval: "15s",
            minIntervalSeconds: 5,
            allowedAlertCooldownMinutes: [5, 10, 15, 30, 60],
            alertCooldownMinutes: 5,
            cacheTier: "L1-Memory",
            updatedAt: new Date().toISOString(),
        });
        errorAlertService.setThresholdOverride(1);

        const cooldownMs = await errorAlertService.getEffectiveCooldownMs();
        expect(cooldownMs).toBe(5 * 60 * 1000);

        const dispatched = await errorAlertService.record5xxError(new Error("Dynamic cooldown test"), {
            url: "/api/v1/checkout",
            method: "POST",
        });
        expect(dispatched).toBe(true);
        expect(sendMailSpy).toHaveBeenCalledTimes(1);
        expect(sendMailSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                html: expect.stringContaining("5 minutes"),
                text: expect.stringContaining("5 minutes"),
            }),
        );
    });
});
