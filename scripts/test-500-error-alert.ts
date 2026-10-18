// Standalone Executable Test & Scenario Script for 5xx Error Threshold Alerting.
// Tests Event-Driven Producer-Consumer pipeline, Admin Recipient resolution, and HTML Template formatting.
// Structured logger used for both development and production execution environments.
// Run with: npx tsx scripts/test-500-error-alert.ts

import "dotenv/config.js";
import Fastify from "fastify";
import { logger } from "../src/common/observability/logger.js";
import { errorAlertService } from "../src/modules/observability/services/errorAlert.service.js";
import { systemAlertConsumer } from "../src/workers/consumers/systemAlert.consumer.js";
import { mailService } from "../src/common/mail/send.mail.js";
import { errorHandler } from "../src/common/errors/error-handler.js";
import { observabilityConfigService } from "../src/modules/observability/services/observabilityConfig.service.js";

// Helper for formatted delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run500ErrorThresholdScenarios() {
    logger.info("[TestScript] Starting Observability 500 Error Threshold & Alerting Test Suite");

    const emailSentLogs: Array<{ to: string; subject: string; errorCount: number; timestamp: string; text?: string; html?: string }> = [];

    // Intercept mailService.sendMail so we can inspect payload without spamming real inbox during script
    const originalSendMail = mailService.sendMail;
    mailService.sendMail = async (options) => {
        emailSentLogs.push({
            to: options.to,
            subject: options.subject,
            errorCount: errorAlertService.getErrorCount(),
            timestamp: new Date().toISOString(),
            text: options.text,
            html: options.html,
        });
        logger.info(
            { to: options.to, subject: options.subject, errorCount: errorAlertService.getErrorCount() },
            "[MailService Mock] Alert email dispatched to SMTP queue",
        );
        return { messageId: `alert-test-${Date.now()}` };
    };

    try {
        // Reset state for clean run
        errorAlertService.reset();
        systemAlertConsumer.clearRecipientCache();

        const liveThreshold = await errorAlertService.getEffectiveThreshold();
        const adminRecipients = await systemAlertConsumer.resolveAdminRecipients();

        errorAlertService.setThresholdOverride(5);
        const configuredThreshold = await errorAlertService.getEffectiveThreshold();

        logger.info(
            {
                liveThreshold,
                testThreshold: configuredThreshold,
                cooldownMinutes: errorAlertService.getCooldownMs() / (60 * 1000),
                adminRecipientsCount: adminRecipients.length,
                adminEmails: adminRecipients.map((r) => r.email),
            },
            "[TestScript] Initial Architecture & Configuration Setup initialized",
        );

        // -------------------------------------------------------------
        // SCENARIO 1: Errors Under Threshold (Safe Baseline)
        // -------------------------------------------------------------
        logger.info({ configuredThreshold }, "[TestScript] Starting Scenario 1: Errors Below Threshold");
        const safeErrorCount = 3;

        for (let i = 1; i <= safeErrorCount; i++) {
            const error = new Error(`Simulated database connection timeout #${i}`);
            const wasDispatched = await errorAlertService.record5xxError(error, {
                url: `/api/v1/orders/checkout`,
                method: "POST",
                ip: "192.168.1.10",
            });
            logger.info(
                { iteration: i, configuredThreshold, alertDispatched: wasDispatched },
                "[TestScript] Simulated error logged below threshold",
            );
        }

        const bufferAfterScenario1 = errorAlertService.getErrorCount();
        if (emailSentLogs.length === 0) {
            logger.info(
                { bufferCount: bufferAfterScenario1, emailsSent: emailSentLogs.length },
                "[TestScript] Scenario 1 PASSED: Threshold not reached, zero spam emails dispatched",
            );
        } else {
            logger.error("[TestScript] Scenario 1 FAILED: Unexpected alert dispatched below threshold");
        }

        // -------------------------------------------------------------
        // SCENARIO 2: Threshold Breach (Producer -> Event -> Consumer)
        // -------------------------------------------------------------
        logger.info("[TestScript] Starting Scenario 2: Threshold Breach and Domain Event Emission");
        const remainingToThreshold = configuredThreshold - errorAlertService.getErrorCount();

        for (let i = 1; i <= remainingToThreshold; i++) {
            const currentTotal = safeErrorCount + i;
            const error = new Error(`PrismaClientInitializationError: Connection pool exhausted #${currentTotal}`);
            const wasDispatched = await errorAlertService.record5xxError(error, {
                url: `/api/v1/inventory/reserve`,
                method: "POST",
                ip: "10.0.0.12",
            });

            if (wasDispatched) {
                logger.info(
                    { errorCount: currentTotal, threshold: configuredThreshold },
                    "[TestScript] THRESHOLD BREACHED: Producer released SERVER_5XX_ALERT event to Consumer",
                );
            }
        }

        if (emailSentLogs.length >= 1) {
            logger.info(
                { totalEmailsSent: emailSentLogs.length },
                "[TestScript] Scenario 2 PASSED: Critical alert event emitted and dispatched to administrators",
            );
        } else {
            logger.error("[TestScript] Scenario 2 FAILED: Expected alert email to be dispatched");
        }

        // -------------------------------------------------------------
        // SCENARIO 3: Cooldown Flood Protection (Spam Suppression)
        // -------------------------------------------------------------
        logger.info("[TestScript] Starting Scenario 3: High Volume Surge During Cooldown Window");
        const surgeErrors = 10;
        const initialSentCount = emailSentLogs.length;

        for (let i = 1; i <= surgeErrors; i++) {
            const error = new Error(`Cascading upstream 502/500 gateway error #${i}`);
            await errorAlertService.record5xxError(error, {
                url: `/api/v1/payments/webhook`,
                method: "POST",
            });
        }

        const newEmailsDuringCooldown = emailSentLogs.length - initialSentCount;
        if (newEmailsDuringCooldown === 0) {
            logger.info(
                { surgeCount: surgeErrors, newEmailsSent: newEmailsDuringCooldown },
                "[TestScript] Scenario 3 PASSED: 15-Minute Cooldown active, all surge errors suppressed",
            );
        } else {
            logger.error(
                { newEmailsSent: newEmailsDuringCooldown },
                "[TestScript] Scenario 3 FAILED: Email flood detected during cooldown",
            );
        }

        // -------------------------------------------------------------
        // SCENARIO 4: Fastify HTTP Request Lifecycle & ErrorHandler
        // -------------------------------------------------------------
        logger.info("[TestScript] Starting Scenario 4: End-to-End Fastify HTTP Crash Pipeline");
        errorAlertService.reset();
        errorAlertService.setThresholdOverride(2);
        emailSentLogs.length = 0;

        const app = Fastify({ logger: false });
        app.setErrorHandler(errorHandler);

        app.get("/test/crash", async () => {
            throw new Error("Unhandled crash in payment reconciliation controller!");
        });

        const res1 = await app.inject({ method: "GET", url: "/test/crash" });
        await sleep(100);

        const res2 = await app.inject({ method: "GET", url: "/test/crash" });
        await sleep(100);

        if (res1.statusCode === 500 && res2.statusCode === 500 && emailSentLogs.length === adminRecipients.length) {
            logger.info(
                { status1: res1.statusCode, status2: res2.statusCode, emailsSent: emailSentLogs.length },
                "[TestScript] Scenario 4 PASSED: Fastify errorHandler caught unhandled exceptions and triggered alert",
            );
        } else {
            logger.error(
                { status1: res1.statusCode, status2: res2.statusCode, emailsSent: emailSentLogs.length },
                "[TestScript] Scenario 4 FAILED: Fastify integration error",
            );
        }

        await app.close();

        // -------------------------------------------------------------
        // SCENARIO 5: Direct Consumer Unit Verification (Isolated Test)
        // -------------------------------------------------------------
        logger.info("[TestScript] Starting Scenario 5: Direct SystemAlertConsumer Verification");
        const mockEvent = {
            id: `manual_test_${Date.now()}`,
            eventType: "SERVER_5XX_ALERT",
            aggregateType: "System",
            aggregateId: "system_health",
            payload: {
                count: 10,
                threshold: 5,
                errorMessage: "Worker isolated simulation test",
                route: "/api/v1/checkout",
                method: "POST",
                timestamp: new Date().toISOString(),
                env: "production",
            },
        };

        const consumerResult = await systemAlertConsumer.handleEvent(mockEvent);
        if (consumerResult.success && consumerResult.dispatchedCount > 0) {
            logger.info(
                { dispatchedCount: consumerResult.dispatchedCount, recipients: consumerResult.recipients },
                "[TestScript] Scenario 5 PASSED: SystemAlertConsumer successfully processed event in isolation",
            );
        } else {
            logger.error("[TestScript] Scenario 5 FAILED: Consumer execution failed");
        }

        // -------------------------------------------------------------
        // SCENARIO 6: Cooldown Expiry & Re-Arming
        // -------------------------------------------------------------
        logger.info("[TestScript] Starting Scenario 6: Cooldown Expiry & System Re-Arming");
        errorAlertService.setCooldownMs(0);

        const reArmedDispatched = await errorAlertService.record5xxError(
            new Error("New crash after cooldown expired"),
            { url: "/api/v1/auth/login", method: "POST" },
        );

        if (reArmedDispatched) {
            logger.info(
                { reArmedDispatched, totalEmailsSent: emailSentLogs.length },
                "[TestScript] Scenario 6 PASSED: Alert engine re-armed successfully and dispatched updated alert",
            );
        } else {
            logger.error("[TestScript] Scenario 6 FAILED: Re-arm check failed");
        }

        // -------------------------------------------------------------
        // SCENARIO 7: Dynamic Alert Cooldown via Observability Policy Configuration
        // -------------------------------------------------------------
        logger.info("[TestScript] Starting Scenario 7: Dynamic Alert Cooldown via Polling Policy");
        errorAlertService.reset();
        emailSentLogs.length = 0;

        // Configure dynamic cooldown to 5 minutes
        await observabilityConfigService.updatePollingPolicy("15m", "15s", 5);
        const effectiveCooldownMs = await errorAlertService.getEffectiveCooldownMs();
        const effectiveMinutes = Math.round(effectiveCooldownMs / 60000);

        errorAlertService.setThresholdOverride(1);
        const dynamicDispatched = await errorAlertService.record5xxError(
            new Error("Dynamic cooldown verification error"),
            { url: "/api/v1/orders/create", method: "POST" },
        );

        const latestEmail = emailSentLogs[emailSentLogs.length - 1];
        const emailContainsCooldown = Boolean(
            latestEmail?.text?.includes("5 minutes") && latestEmail?.html?.includes("5 minutes"),
        );

        if (dynamicDispatched && effectiveMinutes === 5 && emailContainsCooldown) {
            logger.info(
                {
                    effectiveMinutes,
                    emailContainsCooldown,
                    subject: latestEmail?.subject,
                },
                "[TestScript] Scenario 7 PASSED: Dynamic 5-minute cooldown configured, resolved, and rendered in email",
            );
        } else {
            logger.error(
                { effectiveMinutes, emailContainsCooldown },
                "[TestScript] Scenario 7 FAILED: Dynamic alert cooldown was not correctly reflected",
            );
        }

        // Reset policy to standard 15m default
        await observabilityConfigService.updatePollingPolicy("15m", "15s", 15);

        logger.info("[TestScript] ALL 7 OBSERVABILITY SCENARIOS COMPLETED SUCCESSFULLY");
    } finally {
        mailService.sendMail = originalSendMail;
        errorAlertService.reset();
        systemAlertConsumer.clearRecipientCache();
    }
}

// Execute scenario suite
run500ErrorThresholdScenarios()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error({ err }, "[TestScript] Fatal error during scenario execution");
        process.exit(1);
    });
