import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "inventory-test-jwt-secret";

const { inventoryServiceMock, authPrismaMock } = vi.hoisted(() => ({
    inventoryServiceMock: {
        getInventory: vi.fn(),
        listInventories: vi.fn(),
        getLowStockAlerts: vi.fn(),
        addStock: vi.fn(),
        removeStock: vi.fn(),
        adjustStock: vi.fn(),
        reserveStock: vi.fn(),
        confirmReservation: vi.fn(),
        releaseReservation: vi.fn(),
        expireStaleReservations: vi.fn(),
        getTransactions: vi.fn(),
        simulateCheckout: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/inventory/services/inventory.service.js", () => ({
    inventoryService: inventoryServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import inventoryRouter from "../modules/inventory/routes/inventory.route.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";

describe("Inventory HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(inventoryRouter, { prefix: "/api/inventory" });
        return app;
    };

    const mockAdminUser = (permissions: string[] = [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_UPDATE]) => {
        const adminId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "8b51d451-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: adminId,
            email: "admin@test.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "ADMIN",
                        permissions: permissions.map((p) => ({ permission: { name: p } })),
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            id: sessionId,
            userId: adminId,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60000),
        });

        const token = generateAccessToken({ userId: adminId, email: "admin@test.com", sessionId });
        return { token, adminId };
    };

    it("requires authentication for inventory endpoints", async () => {
        const app = await createTestApp();

        const response = await app.inject({
            method: "GET",
            url: "/api/inventory",
        });

        expect(response.statusCode).toBe(401);
    });

    it("lists inventory when caller has inventory:read permission", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser([PERMISSIONS.INVENTORY_READ]);

        inventoryServiceMock.listInventories.mockResolvedValue({
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/inventory",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.success).toBe(true);
        expect(json.message).toBe("Inventories retrieved successfully");
    });

    it("adds stock when caller has inventory:update permission", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser([PERMISSIONS.INVENTORY_UPDATE]);
        const variantId = "60a80e14-6334-4b52-9c3f-42e887d95a12";

        inventoryServiceMock.addStock.mockResolvedValue({
            inventory: { id: "inv-1", variantId, availableQuantity: 50 },
            transaction: { id: "tx-1", type: "STOCK_ADDED", quantity: 50 },
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/inventory/add-stock",
            headers: { authorization: `Bearer ${token}` },
            payload: {
                variantId,
                quantity: 50,
                note: "Initial shipment",
            },
        });

        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.success).toBe(true);
        expect(json.data.inventory.availableQuantity).toBe(50);
    });

    it("reserves stock for checkout session", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser([]);
        const variantId = "60a80e14-6334-4b52-9c3f-42e887d95a12";

        inventoryServiceMock.reserveStock.mockResolvedValue({
            reservation: { id: "res-1", variantId, quantity: 2, status: "ACTIVE" },
            inventory: { availableQuantity: 8, reservedQuantity: 2 },
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/inventory/reservations/reserve",
            headers: { authorization: `Bearer ${token}` },
            payload: {
                variantId,
                quantity: 2,
                expiresInMinutes: 15,
            },
        });

        expect(response.statusCode).toBe(201);
        const json = response.json();
        expect(json.success).toBe(true);
        expect(json.data.reservation.status).toBe("ACTIVE");
    });

    it("runs simulated checkout flow", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser([]);
        const variantId = "60a80e14-6334-4b52-9c3f-42e887d95a12";

        inventoryServiceMock.simulateCheckout.mockResolvedValue({
            flowStatus: "ORDER_COMPLETED",
            variantId,
            quantity: 2,
            timeline: [
                { step: 1, action: "STOCK_RESERVED", status: "SUCCESS" },
                { step: 2, action: "SIMULATED_PAYMENT", status: "SUCCESS" },
                { step: 3, action: "RESERVATION_CONFIRMED", status: "COMPLETED" },
            ],
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/inventory/checkout/simulate",
            headers: { authorization: `Bearer ${token}` },
            payload: {
                variantId,
                quantity: 2,
                simulatePaymentSuccess: true,
            },
        });

        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.success).toBe(true);
        expect(json.data.flowStatus).toBe("ORDER_COMPLETED");
        expect(json.data.timeline).toHaveLength(3);
    });
});
