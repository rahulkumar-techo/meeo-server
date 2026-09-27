import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    interpolateVariables,
    renderNotificationContent,
    isCustomerEvent,
} from "@/workers/templates/notificationTemplates.js";
import { NotificationPreferenceService } from "@/modules/notifications/services/notificationPreference.service.js";
import { NotificationDispatcherService } from "@/modules/notifications/services/notificationDispatcher.service.js";
import { NotificationConsumer } from "@/workers/consumers/notification.consumer.js";
import { emailProvider } from "@/workers/providers/email.provider.js";
import { pushProvider } from "@/workers/providers/push.provider.js";
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
            groupBy: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
        notificationPreference: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        deviceToken: {
            findMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
        order: {
            findUnique: vi.fn(),
        },
        payment: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("@/sockets/socket.server.js", () => ({
    isUserSocketConnected: vi.fn(),
    emitToUser: vi.fn(),
}));

vi.mock("@/workers/providers/email.provider.js", () => ({
    emailProvider: {
        sendEmail: vi.fn(),
    },
}));

vi.mock("@/workers/providers/push.provider.js", () => ({
    pushProvider: {
        sendPush: vi.fn(),
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

    describe("Customer Scenario Templates & Categories", () => {
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

        it("renders templates across all 5 Customer Categories (Order, Payment, Delivery, Return/Refund, Account/Security)", () => {
            // 1. Order Category
            const orderConfirmed = renderNotificationContent("ORDER_CONFIRMED", {
                customerName: "Alice",
                orderNumber: "ORD-101",
                totalAmount: "50.00",
                currency: "$",
            });
            expect(orderConfirmed.title).toBe("Order Confirmed");
            expect(orderConfirmed.pushTitle).toContain("Order Confirmed");
            expect(isCustomerEvent("ORDER_CONFIRMED")).toBe(true);

            // 2. Payment Category
            const paymentFailed = renderNotificationContent("PAYMENT_FAILED", {
                customerName: "Alice",
                orderNumber: "ORD-101",
            });
            expect(paymentFailed.title).toBe("Payment Failed");
            expect(paymentFailed.pushTitle).toContain("Payment Failed");
            expect(isCustomerEvent("PAYMENT_FAILED")).toBe(true);

            // 3. Delivery Category
            const shipped = renderNotificationContent("ORDER_SHIPPED", {
                customerName: "Alice",
                orderNumber: "ORD-101",
                carrier: "BlueDart",
                trackingNumber: "TRK-98765",
            });
            expect(shipped.title).toBe("Order Shipped");
            expect(shipped.pushBody).toContain("BlueDart");
            expect(isCustomerEvent("ORDER_SHIPPED")).toBe(true);

            const outForDelivery = renderNotificationContent("ORDER_OUT_FOR_DELIVERY", {
                customerName: "Alice",
                orderNumber: "ORD-101",
            });
            expect(outForDelivery.title).toBe("Out for Delivery");
            expect(isCustomerEvent("ORDER_OUT_FOR_DELIVERY")).toBe(true);

            // 4. Return/Refund Category
            const refundInit = renderNotificationContent("REFUND_INITIATED", {
                customerName: "Alice",
                orderNumber: "ORD-101",
                amount: "50.00",
                currency: "$",
            });
            expect(refundInit.title).toBe("Refund Initiated");
            expect(isCustomerEvent("REFUND_INITIATED")).toBe(true);

            // 5. Account/Security Category
            const passChanged = renderNotificationContent("ACCOUNT_PASSWORD_CHANGED", {
                customerName: "Alice",
            });
            expect(passChanged.title).toBe("Account Password Changed");
            expect(isCustomerEvent("ACCOUNT_PASSWORD_CHANGED")).toBe(true);
        });
    });

    describe("NotificationPreferenceService", () => {
        const prefService = new NotificationPreferenceService();

        it("returns customer defaults with push & email enabled and in-app disabled", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);

            const prefs = await prefService.getUserPreferences("user-1");

            expect(prefs.emailEnabled).toBe(true);
            expect(prefs.pushEnabled).toBe(true);
            expect(prefs.inAppEnabled).toBe(false);
            expect(prefs.orderUpdates).toBe(true);
            expect(prefs.securityAlerts).toBe(true);
        });

        it("disallows IN_APP notifications strictly", async () => {
            const inAppAllowed = await prefService.isNotificationAllowed("user-1", "IN_APP", "order");
            expect(inAppAllowed).toBe(false);
        });

        it("evaluates push and email allowance based on preference categories", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
                id: "pref-1",
                userId: "user-1",
                emailEnabled: true,
                pushEnabled: false,
                inAppEnabled: false,
                orderUpdates: true,
                promotions: false,
                securityAlerts: true,
                lowStockAlerts: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const emailAllowed = await prefService.isNotificationAllowed("user-1", "EMAIL", "order");
            expect(emailAllowed).toBe(true);

            const pushAllowed = await prefService.isNotificationAllowed("user-1", "PUSH", "order");
            expect(pushAllowed).toBe(false);
        });
    });

    describe("NotificationDispatcherService & NotificationDeliveryService", () => {
        const dispatcher = new NotificationDispatcherService();

        it("dispatches PUSH_AND_EMAIL when user has registered device token and email", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.deviceToken.findMany).mockResolvedValue([
                { token: "device-token-123", platform: "web", userId: "user-1" } as any,
            ]);
            vi.mocked(pushProvider.sendPush).mockResolvedValue({ ticketId: "push-1", success: true });
            vi.mocked(emailProvider.sendEmail).mockResolvedValue({ messageId: "mail-1", success: true });
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

            expect(result.deliveryMode).toBe("PUSH_AND_EMAIL");
            expect(result.channelsAttempted).toEqual(["PUSH", "EMAIL"]);
            expect(pushProvider.sendPush).toHaveBeenCalledWith(
                expect.objectContaining({ userId: "user-1", deviceToken: "device-token-123" }),
            );
            expect(emailProvider.sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: "customer@example.com" }),
            );
        });

        it("dispatches PUSH_AND_EMAIL for ORDER_DELIVERED (delivers delivery confirmation & purchase billing)", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.deviceToken.findMany).mockResolvedValue([
                { token: "fcm-token-android-123", platform: "android", userId: "user-1" } as any,
            ]);
            vi.mocked(pushProvider.sendPush).mockResolvedValue({ ticketId: "fcm-1", success: true });
            vi.mocked(emailProvider.sendEmail).mockResolvedValue({ messageId: "mail-1", success: true });
            vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-db" } as any);

            const result = await dispatcher.sendNotificationForEvent(
                "ORDER_DELIVERED",
                {
                    userId: "user-1",
                    email: "customer@example.com",
                    customerName: "Alice",
                },
                { orderNumber: "ORD-555", totalAmount: 1200 },
            );

            expect(result.deliveryMode).toBe("PUSH_AND_EMAIL");
            expect(result.channelsAttempted).toEqual(["PUSH", "EMAIL"]);
            expect(pushProvider.sendPush).toHaveBeenCalledWith(
                expect.objectContaining({ userId: "user-1", deviceToken: "fcm-token-android-123" }),
            );
            expect(emailProvider.sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: "customer@example.com" }),
            );
        });

        it("dispatches PUSH_ONLY for intermediate operational status updates (e.g. ORDER_SHIPPED) without sending unnecessary emails", async () => {
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.deviceToken.findMany).mockResolvedValue([
                { token: "fcm-token-android-123", platform: "android", userId: "user-1" } as any,
            ]);
            vi.mocked(pushProvider.sendPush).mockResolvedValue({ ticketId: "fcm-1", success: true });
            vi.mocked(prisma.notification.create).mockResolvedValue({ id: "notif-db" } as any);

            const result = await dispatcher.sendNotificationForEvent(
                "ORDER_SHIPPED",
                {
                    userId: "user-1",
                    email: "customer@example.com",
                    customerName: "Alice",
                },
                { orderNumber: "ORD-555", carrier: "BlueDart", trackingNumber: "TRK-123" },
            );

            expect(result.deliveryMode).toBe("PUSH_ONLY");
            expect(result.channelsAttempted).toEqual(["PUSH"]);
            expect(pushProvider.sendPush).toHaveBeenCalledWith(
                expect.objectContaining({ userId: "user-1", deviceToken: "fcm-token-android-123" }),
            );
            expect(emailProvider.sendEmail).not.toHaveBeenCalled();
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
        });

        it("marks all notifications as read for a user", async () => {
            vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 4 });

            const res = await dispatcher.markAllAsRead("user-1");
            expect(res.count).toBe(4);
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
        });
    });

    describe("NotificationConsumer (Outbox Event Processing)", () => {
        const consumer = new NotificationConsumer();

        it("processes customer domain events and delivers push/email", async () => {
            vi.mocked(processedEventService.runWithConsumerIdempotency).mockImplementation(
                async (_name, _id, fn) => {
                    const data = await fn();
                    return { success: true, alreadyProcessed: false, data };
                },
            );

            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
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
