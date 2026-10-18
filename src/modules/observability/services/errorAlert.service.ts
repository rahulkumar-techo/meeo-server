// Automated 5xx Server Error Alerting Service.
// Monitors rolling 60-second 5xx error rates and dispatches email alerts to administrators with flood cooldown.

import { ulid } from "ulid";
import { logger } from "@/common/observability/logger.js";
import { publishDomainEventJob } from "@/lib/queue.js";
import { systemAlertConsumer, type SystemAlertEvent } from "@/workers/consumers/systemAlert.consumer.js";
import { observabilityConfigService } from "./observabilityConfig.service.js";

export class ErrorAlertService {
    private errorTimestamps: number[] = [];
    private lastAlertDispatchedAt = 0;
    // Default 15-minute fallback cooldown between alert emails
    private cooldownMs = 15 * 60 * 1000;
    private cooldownOverrideMs: number | null = null;
    private max5xxDefaultThreshold = 5;
    private thresholdOverride: number | null = null;

    /**
     * Resolves the active 5xx threshold from DB/Redis config or configured fallback.
     */
    async getEffectiveThreshold(): Promise<number> {
        if (this.thresholdOverride !== null) {
            return this.thresholdOverride;
        }
        try {
            const config = await observabilityConfigService.getConfig("thresholds:server_5xx");
            if (config?.value?.max5xxVolumePerMinute) {
                return config.value.max5xxVolumePerMinute;
            }
        } catch {
            // Non-critical fallback to default threshold if cache/DB error occurs
        }
        return this.max5xxDefaultThreshold;
    }

    /**
     * Resolves active alert email cooldown duration dynamically from polling policy / config cache.
     */
    async getEffectiveCooldownMs(): Promise<number> {
        if (this.cooldownOverrideMs !== null) {
            return this.cooldownOverrideMs;
        }
        try {
            // 1. Check server-managed polling policy L1/L2 cache
            const policy = await observabilityConfigService.getPollingPolicy();
            if (policy?.alertCooldownMinutes && policy.alertCooldownMinutes > 0) {
                return policy.alertCooldownMinutes * 60 * 1000;
            }

            // 2. Check server_5xx threshold config
            const config = await observabilityConfigService.getConfig("thresholds:server_5xx");
            if (typeof config?.value?.cooldownMinutes === "number" && config.value.cooldownMinutes > 0) {
                return config.value.cooldownMinutes * 60 * 1000;
            }
        } catch {
            // Non-critical fallback to default cooldown
        }
        return this.cooldownMs;
    }

    /**
     * Sets an explicit threshold override (useful for testing and emergency manual tuning).
     */
    setThresholdOverride(threshold: number | null): void {
        this.thresholdOverride = threshold;
    }

    /**
     * Records a 5xx server error, evaluates against alert thresholds, and dispatches an alert email if triggered.
     * Returns true if an alert was dispatched, false otherwise (below threshold or in cooldown).
     */
    async record5xxError(error: Error | unknown, context: Record<string, unknown> = {}): Promise<boolean> {
        const now = Date.now();
        this.errorTimestamps.push(now);

        // Retain only errors occurring within the last 60 seconds
        this.errorTimestamps = this.errorTimestamps.filter((t) => now - t <= 60_000);
        const current5xxCount = this.errorTimestamps.length;
        const threshold = await this.getEffectiveThreshold();

        if (current5xxCount >= threshold) {
            return await this.triggerAlert(current5xxCount, threshold, error, context);
        }
        return false;
    }

    /**
     * Evaluates cooldown, creates a SERVER_5XX_ALERT domain event, and releases it to queue and consumer.
     */
    private async triggerAlert(
        count: number,
        threshold: number,
        error: Error | unknown,
        context: Record<string, unknown>,
    ): Promise<boolean> {
        const now = Date.now();
        const cooldownMs = await this.getEffectiveCooldownMs();

        if (now - this.lastAlertDispatchedAt < cooldownMs) {
            logger.warn(
                { current5xxCount: count, threshold, remainingCooldownSec: Math.round((cooldownMs - (now - this.lastAlertDispatchedAt)) / 1000) },
                "[ErrorAlertService] 5xx threshold breached but alert email is in cooldown period.",
            );
            return false;
        }

        this.lastAlertDispatchedAt = now;
        const err = error instanceof Error ? error : new Error(String(error));
        const env = process.env.NODE_ENV || "development";
        const route = (context.url as string) || (context.route as string) || "Unknown route";
        const method = (context.method as string) || "GET";
        const stackSnippet = (err.stack || "No stack trace available").split("\n").slice(0, 5).join("\n");
        const cooldownMinutes = Math.max(1, Math.round(cooldownMs / 60000));

        // Create modular domain event payload
        const alertEvent: SystemAlertEvent = {
            id: `alert_${now}_${ulid().toLowerCase()}`,
            eventType: "SERVER_5XX_ALERT",
            aggregateType: "System",
            aggregateId: "system_health",
            payload: {
                count,
                threshold,
                errorMessage: err.message,
                stackSnippet,
                route,
                method,
                timestamp: new Date().toISOString(),
                env,
                dashboardUrl: `${process.env.ADMIN_DASHBOARD_URL || "http://localhost:3000"}/system/metrics`,
                cooldownMinutes,
            },
        };

        // 1. Release event to BullMQ primary domain queue for distributed worker processing
        try {
            await publishDomainEventJob("SERVER_5XX_ALERT", alertEvent as unknown as Record<string, unknown>);
        } catch (queueErr: any) {
            logger.warn(
                { err: queueErr?.message || queueErr },
                "[ErrorAlertService] BullMQ publish skipped/failed, executing consumer directly",
            );
        }

        // 2. Consume event via SystemAlertConsumer to resolve admins and dispatch email
        const consumerResult = await systemAlertConsumer.handleEvent(alertEvent);
        return consumerResult.success;
    }

    /**
     * Returns count of errors in the rolling 60-second window.
     */
    getErrorCount(): number {
        const now = Date.now();
        this.errorTimestamps = this.errorTimestamps.filter((t) => now - t <= 60_000);
        return this.errorTimestamps.length;
    }

    /**
     * Returns timestamp of last alert email dispatch.
     */
    getLastAlertTime(): number {
        return this.lastAlertDispatchedAt;
    }

    /**
     * Returns current configured cooldown duration in milliseconds.
     */
    getCooldownMs(): number {
        return this.cooldownOverrideMs ?? this.cooldownMs;
    }

    /**
     * Updates cooldown duration override (useful for testing or fine-tuning).
     */
    setCooldownMs(ms: number): void {
        this.cooldownOverrideMs = ms;
    }

    /**
     * Updates default threshold (useful for testing or fallback tuning).
     */
    setDefaultThreshold(threshold: number): void {
        this.max5xxDefaultThreshold = threshold;
    }

    /**
     * Returns default threshold.
     */
    getDefaultThreshold(): number {
        return this.max5xxDefaultThreshold;
    }

    /**
     * Resets tracking buffers and cooldown (primarily for test suites).
     */
    reset(): void {
        this.errorTimestamps = [];
        this.lastAlertDispatchedAt = 0;
        this.cooldownMs = 15 * 60 * 1000;
        this.cooldownOverrideMs = null;
        this.max5xxDefaultThreshold = 5;
        this.thresholdOverride = null;
    }
}

export const errorAlertService = new ErrorAlertService();
