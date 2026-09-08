import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "settings-test-jwt-secret";

const { authPrismaMock } = vi.hoisted(() => ({
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
    },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import settingRouter from "../modules/settings/routes/setting.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("System Settings HTTP API Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(settingRouter, { prefix: "/api/v1/settings" });
        return app;
    };

    const mockAdminUser = () => {
        const userId = "admin-user-uuid-1111-2222-333344445555";
        const sessionId = "session-uuid-1111-2222-333344445555";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@store.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [{ permission: { name: PERMISSIONS.SYSTEM_MANAGE } }],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            id: sessionId,
            userId,
            isValid: true,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        });

        const token = generateAccessToken({
            userId,
            email: "admin@store.com",
            sessionId,
        });
        return { token, userId };
    };

    it("GET /api/v1/settings/public returns public brand settings without authentication", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/settings/public",
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.platformBrandName).toBeDefined();
        expect(json.data.defaultCurrency).toBeDefined();
        expect(json.data.featureFlags).toBeDefined();
    });

    it("GET /api/v1/settings returns full system settings for admin", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/settings",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.settlementFrequency).toBeDefined();
        expect(json.data.refundApprovalThreshold).toBeDefined();
        expect(json.data.emergencyControls).toBeDefined();
    });

    it("PUT /api/v1/settings updates settings with audit log emission", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        const res = await app.inject({
            method: "PUT",
            url: "/api/v1/settings",
            headers: { authorization: `Bearer ${token}` },
            payload: {
                platformBrandName: "Updated Platform Name",
                settlementFrequency: "DAILY",
                refundApprovalThreshold: 750.00,
            },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.platformBrandName).toBe("Updated Platform Name");
        expect(json.data.settlementFrequency).toBe("DAILY");
        expect(json.data.refundApprovalThreshold).toBe(750.00);
    });

    it("POST /api/v1/settings/emergency-kill-switch freezes platform", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/settings/emergency-kill-switch",
            headers: { authorization: `Bearer ${token}` },
            payload: {
                killSwitchActive: true,
                emergencyMessage: "Emergency security lockdown",
            },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.emergencyControls.killSwitchActive).toBe(true);
        expect(json.data.maintenanceMode).toBe(true);
    });
});
