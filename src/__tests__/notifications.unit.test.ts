import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    interpolateVariables,
    renderNotificationContent,
    NOTIFICATION_TEMPLATES,
} from "@/modules/notifications/templates/notificationTemplates.js";
import { NotificationPreferenceService } from "@/modules/notifications/services/notificationPreference.service.js";
import { NotificationDispatcherService } from "@/modules/notifications/services/notificationDispatcher.service.js";
import { NotificationConsumer } from "@/modules/outbox/handlers/consumers/notificationConsumer.js";
import { emailProvider } from "@/modules/notifications/providers/email.provider.js";
import { pushProvider } from "@/modules/notifications/providers/push.provider.js";
import { inAppProvider } from "@/modules/notifications/providers/inApp.provider.js";
import { processedEventService } from "@/modules/outbox/services/processedEvent.service.js";
import { prisma } from "@/lib/prisma.js";

// Mock dependencies
vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        notification: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
        notificationPreference: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        order: {
            findUnique: vi.fn(),
        },
        payment: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("@/modules/notifications/providers/email.provider.js", () => ({
    emailProvider: {
        sendEmail: vi.fn(),
    },
}));

vi.mock("@/modules/notifications/providers/push.provider.js", () => ({
    pushProvider: {
        sendPush: vi.fn(),
    },
}));

vi.mock("@/modules/notifications/providers/inApp.provider.ts", () => ({
    inAppProvider: {
        createInAppNotification: vi.fn(),
    },
}));

vi.mock("@/modules/outbox/services/processedEvent.service.js", () => ({
    processedEventService: {
        runWithConsumerIdempotency: vi.fn(),
    },
}));

describe("Notifications Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Templates & Variable Interpolation", () => {
        it("interpolates variables correctly into placeholders", () => {
            const template = "Hello {{customerName}}, your order #{{orderNumber}} total is {{currency}} {{total}}.";
            const rendered = interpolateVariables(template, {
                customerName: "Alice",
                orderNumber: "ORD-999",
                currency: "USD",
                total: "149.99",
            });

            expect(rendered).toBe("Hello Alice, your order #ORD-999 total is USD 149.99.");
        });

        it("renders predefined templates for ORDER_CONFIRMED, ORDER_SHIPPED, PAYMENT_SUCCESS, and LOW_STOCK", () => {
            const confirmed = renderNotificationContent("ORDER_CONFIRMED", {
                customerName: "Bob",
                orderNumber: "ORD-101",
                totalAmount: "50.00",
                currency: "$",
            });
            expect(confirmed.title).toBe("Order Confirmed!");
            expect(confirmed.body).toContain("ORD-101");
            expect(confirmed.html).toContain("Bob");

            const shipped = renderNotificationContent("ORDER_SHIPPED", {
                customerName: "Bob",
                orderNumber: "ORD-101",
                carrier: "FedEx",
                trackingNumber: "TRK-12345",
            });
            expect(shipped.title).toBe("Order Shipped!");
            expect(shipped.body).toContain("FedEx");
            expect(shipped.body).toContain("TRK-12345");

            const paymentSuccess = renderNotificationContent("PAYMENT_SUCCESS", {
                customerName: "Bob",
                orderNumber: "ORD-101",
                amount: 50,
                currency: "$",
                provider: "Razorpay",
                transactionId: "pay_123",
            });
            expect(paymentSuccess.title).toBe("Payment Successful");
            expect(paymentSuccess.body).toContain("$ 50");

            const lowStock = renderNotificationContent("LOW_STOCK", {
                productName: "Wireless Mouse",
                sku: "WM-001",
                remainingStock: 3,
                threshold: 10,
            });
            expect(lowStock.title).toBe("Low Inventory Warning");
            expect(lowStock.body).toContain("Wireless Mouse");
            expect(lowStock.body).toContain("3 units remaining");
        });
    });

    describe("NotificationPreferenceService", () => {
        const prefService = new NotificationPreferenceService();

        it("returns defaults when no preferences record exists in database", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);

            const prefs = await prefService.getUserPreferences("user-1");

            expect(prefs.emailEnabled).toBe(true);
            expect(prefs.pushEnabled).toBe(true);
            expect(prefs.inAppEnabled).toBe(true);
            expect(prefs.orderUpdates).toBe(true);
        });

        it("updates preferences via upsert", async () => {
            vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue({
                id: "pref-1",
                userId: "user-1",
                emailEnabled: false,
                pushEnabled: true,
                inAppEnabled: true,
                orderUpdates: true,
                promotions: false,
                securityAlerts: true,
                lowStockAlerts: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const updated = await prefService.updateUserPreferences("user-1", {
                emailEnabled: false,
                promotions: false,
            });

            expect(updated.emailEnabled).toBe(false);
            expect(updated.promotions).toBe(false);
        });

        it("evaluates isNotificationAllowed properly based on channel and category flags", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
                id: "pref-1",
                userId: "user-1",
                emailEnabled: false,
                pushEnabled: true,
                inAppEnabled: true,
                orderUpdates: true,
                promotions: false,
                securityAlerts: true,
                lowStockAlerts: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const emailAllowed = await prefService.isNotificationAllowed("user-1", "EMAIL", "orderUpdates");
            expect(emailAllowed).toBe(false); // email is disabled

            const pushAllowed = await prefService.isNotificationAllowed("user-1", "PUSH", "orderUpdates");
            expect(pushAllowed).toBe(true); // push is enabled and orderUpdates is true

            const promoAllowed = await prefService.isNotificationAllowed("user-1", "PUSH", "promotions");
            expect(promoAllowed).toBe(false); // promotions category is false
        });
    });

    describe("NotificationDispatcherService", () => {
        const dispatcher = new NotificationDispatcherService();

        it("dispatches multi-channel notification across In-App, Email, and Push", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null); // Defaults to all true
            vi.mocked(inAppProvider.createInAppNotification).mockResolvedValue({ id: "notif-inapp" } as any);
            vi.mocked(emailProvider.sendEmail).mockResolvedValue({ messageId: "mail-1", success: true });
            vi.mocked(pushProvider.sendPush).mockResolvedValue({ ticketId: "push-1", success: true });
            vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-db" } as any);

            const result = await dispatcher.sendNotificationForEvent(
                "ORDER_CONFIRMED",
                {
                    userId: "user-1",
                    email: "customer@example.com",
                    customerName: "Alice",
                },
                { orderNumber: "ORD-555", totalAmount: 100 },
            );

            expect(result.channelsAttempted).toEqual(["IN_APP", "EMAIL", "PUSH"]);
            expect(inAppProvider.createInAppNotification).toHaveBeenCalledTimes(1);
            expect(emailProvider.sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: "customer@example.com" }),
            );
            expect(pushProvider.sendPush).toHaveBeenCalledTimes(1);
        });

        it("marks single notification as read", async () => {
            vi.mocked(prisma.notification.findFirst).mockResolvedValue({
                id: "notif-1",
                userId: "user-1",
            } as any);
            vi.mocked(prisma.notification.update).mockResolvedValue({
                id: "notif-1",
                status: "READ",
                readAt: new Date(),
            } as any);

            const res = await dispatcher.markNotificationAsRead("user-1", "notif-1");
            expect(res.status).toBe("READ");
            expect(prisma.notification.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "notif-1" },
                    data: expect.objectContaining({ status: "READ" }),
                }),
            );
        });

        it("marks all notifications as read for a user", async () => {
            vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 4 });

            const res = await dispatcher.markAllAsRead("user-1");
            expect(res.count).toBe(4);
            expect(prisma.notification.updateMany).toHaveBeenCalledWith({
                where: { userId: "user-1", readAt: null },
                data: expect.objectContaining({ status: "READ" }),
            });
        });

        it("retries a failed email notification delivery", async () => {
            vi.mocked(prisma.notification.findUnique).mockResolvedValue({
                id: "notif-fail",
                channel: "EMAIL",
                status: "FAILED",
                attempts: 1,
                title: "Order Update",
                body: "Your order has been updated",
                data: { recipientEmail: "buyer@test.com" },
            } as any);

            vi.mocked(emailProvider.sendEmail).mockResolvedValue({ messageId: "msg-retry", success: true });
            vi.mocked(prisma.notification.update).mockResolvedValue({
                id: "notif-fail",
                status: "SENT",
                attempts: 2,
            } as any);

            const result = await dispatcher.retryFailedNotification("notif-fail");
            expect(result.status).toBe("SENT");
            expect(emailProvider.sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: "buyer@test.com" }),
            );
            expect(prisma.notification.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "notif-fail" },
                    data: expect.objectContaining({ status: "SENT", attempts: 2 }),
                }),
            );
        });
    });

    describe("NotificationConsumer (Outbox Event Processing)", () => {
        const consumer = new NotificationConsumer();

        it("processes order event and calls dispatcher inside idempotency wrapper", async () => {
            vi.mocked(processedEventService.runWithConsumerIdempotency).mockImplementation(
                async (_name, _id, fn) => {
                    const data = await fn();
                    return { success: true, alreadyProcessed: false, data };
                },
            );

            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
            vi.mocked(inAppProvider.createInAppNotification).mockResolvedValue({ id: "inapp-1" } as any);
            vi.mocked(emailProvider.sendEmail).mockResolvedValue({ messageId: "mail-1", success: true });
            vi.mocked(pushProvider.sendPush).mockResolvedValue({ ticketId: "push-1", success: true });
            vi.mocked(prisma.notification.create).mockResolvedValue({ id: "db-1" } as any);

            const event = {
                id: "evt-notif-100",
                eventType: "ORDER_CONFIRMED",
                aggregateType: "Order",
                aggregateId: "order-uuid-1",
                payload: {
                    userId: "user-uuid-1",
                    customerEmail: "customer@domain.com",
                    customerName: "Charlie",
                    orderNumber: "ORD-9999",
                    totalAmount: 250,
                },
            };

            await consumer.handleEvent(event);

            expect(processedEventService.runWithConsumerIdempotency).toHaveBeenCalledWith(
                "NotificationConsumer",
                "evt-notif-100",
                expect.any(Function),
            );
            expect(emailProvider.sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: "customer@domain.com" }),
            );
        });
    });
});
