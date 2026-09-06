import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "audit-test-jwt-secret";

const { auditLogServiceMock, authPrismaMock } = vi.hoisted(() => ({
    auditLogServiceMock: {
        listLogs: vi.fn(),
        getLogById: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/audit/services/auditLog.service.js", () => ({
    auditLogService: auditLogServiceMock,
}));

vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import auditLogRouter from "../modules/audit/routes/auditLog.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Audit Logs HTTP Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(auditLogRouter, { prefix: "/api/v1/admin/audit-logs" });
        return app;
    };

    const mockAdminUser = () => {
        const userId = "admin-uuid-0001";
        const sessionId = "session-admin-0001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@store.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [
                            { permission: { name: PERMISSIONS.AUDIT_LOG_READ } },
                        ],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "admin@store.com",
        });

        return { token, userId };
    };

    const mockCustomerUser = () => {
        const userId = "customer-uuid-0001";
        const sessionId = "session-cust-0001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "customer@test.com",
            status: "ACTIVE",
            roles: [],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "customer@test.com",
        });

        return { token, userId };
    };

    describe("Authentication & RBAC Access Control", () => {
        it("rejects unauthenticated requests with 401 Unauthorized", async () => {
            const app = await createTestApp();

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/audit-logs",
            });

            expect(res.statusCode).toBe(401);
            await app.close();
        });

        it("rejects customer requests lacking audit permissions with 403 Forbidden", async () => {
            const app = await createTestApp();
            const { token } = mockCustomerUser();

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/audit-logs",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(403);
            await app.close();
        });
    });

    describe("GET /api/v1/admin/audit-logs", () => {
        it("returns paginated audit logs for authorized admin", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            auditLogServiceMock.listLogs.mockResolvedValue({
                items: [
                    {
                        id: "log-1",
                        action: "PRODUCT_CREATED",
                        entityType: "Product",
                        entityId: "prod-1",
                        oldValue: null,
                        newValue: { name: "New Product" },
                        ipAddress: "127.0.0.1",
                        userAgent: "AdminPortal",
                        createdAt: new Date("2026-09-06T12:00:00Z"),
                        actor: { id: "admin-1", email: "admin@store.com", name: "Admin" },
                    },
                ],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/audit-logs?page=1&limit=20&entityType=Product",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.items).toHaveLength(1);
            expect(json.data.items[0].action).toBe("PRODUCT_CREATED");

            await app.close();
        });
    });

    describe("GET /api/v1/admin/audit-logs/:id", () => {
        it("returns full audit log detail when valid UUID is provided", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            auditLogServiceMock.getLogById.mockResolvedValue({
                id: "e5033c46-95e3-4d22-b5e1-0bfab4b901a1",
                action: "USER_DEACTIVATED",
                entityType: "User",
                entityId: "user-88",
                oldValue: { status: "ACTIVE" },
                newValue: { status: "SUSPENDED" },
                ipAddress: "10.0.0.1",
                userAgent: "Chrome/128.0",
                createdAt: new Date("2026-09-06T12:00:00Z"),
                actor: { id: "admin-1", email: "admin@store.com", name: "Admin" },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/audit-logs/e5033c46-95e3-4d22-b5e1-0bfab4b901a1",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.action).toBe("USER_DEACTIVATED");

            await app.close();
        });

        it("returns 404 when audit log record is not found", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            auditLogServiceMock.getLogById.mockResolvedValue(null);

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/audit-logs/00000000-0000-0000-0000-000000000000",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(404);
            await app.close();
        });
    });
});
