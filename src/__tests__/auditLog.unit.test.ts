import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        auditLog: {
            create: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock("@/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

import { auditLogService } from "../modules/audit/services/auditLog.service.js";

describe("AuditLogService Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("recordLog", () => {
        it("creates an audit log entry while automatically redacting sensitive values", async () => {
            prismaMock.auditLog.create.mockImplementation((args: any) => Promise.resolve({ id: "audit-1", ...args.data }));

            const result = await auditLogService.recordLog({
                actorId: "actor-uuid-1",
                action: "USER_PASSWORD_RESET",
                entityType: "User",
                entityId: "user-uuid-99",
                oldValue: { password: "old-secret-password-123", email: "user@test.com" },
                newValue: { password: "new-secret-password-456", email: "user@test.com" },
                ipAddress: "198.51.100.1",
                userAgent: "Mozilla/5.0",
            });

            expect(result).toBeDefined();
            expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
                data: {
                    actorId: "actor-uuid-1",
                    action: "USER_PASSWORD_RESET",
                    entityType: "User",
                    entityId: "user-uuid-99",
                    oldValue: { password: "[REDACTED]", email: "user@test.com" },
                    newValue: { password: "[REDACTED]", email: "user@test.com" },
                    ipAddress: "198.51.100.1",
                    userAgent: "Mozilla/5.0",
                },
            });
        });

        it("gracefully catches database errors without crashing callers", async () => {
            prismaMock.auditLog.create.mockRejectedValue(new Error("DB Connection Failed"));

            const result = await auditLogService.recordLog({
                action: "PAYMENT_REFUNDED",
                entityType: "Payment",
            });

            expect(result).toBeNull();
        });
    });

    describe("listLogs", () => {
        it("retrieves paginated audit log entries with filters", async () => {
            const mockDate = new Date("2026-09-06T12:00:00Z");
            prismaMock.auditLog.findMany.mockResolvedValue([
                {
                    id: "log-1",
                    action: "ROLE_GRANTED",
                    entityType: "UserRole",
                    entityId: "ur-1",
                    oldValue: null,
                    newValue: { role: "ADMIN" },
                    ipAddress: "127.0.0.1",
                    userAgent: "TestAgent",
                    createdAt: mockDate,
                    actor: {
                        id: "actor-1",
                        email: "superadmin@store.com",
                        firstName: "Admin",
                        lastName: "User",
                    },
                },
            ]);
            prismaMock.auditLog.count.mockResolvedValue(1);

            const result = await auditLogService.listLogs({
                page: 1,
                limit: 10,
                entityType: "UserRole",
                action: "ROLE_GRANTED",
            });

            expect(result.pagination.total).toBe(1);
            expect(result.items).toHaveLength(1);
            const first = result.items[0]!;
            expect(first.action).toBe("ROLE_GRANTED");
            expect(first.actor?.email).toBe("superadmin@store.com");
            expect(first.actor?.name).toBe("Admin User");
        });
    });

    describe("getLogById", () => {
        it("returns single audit log record when found", async () => {
            const mockDate = new Date("2026-09-06T12:00:00Z");
            prismaMock.auditLog.findUnique.mockResolvedValue({
                id: "log-100",
                action: "ORDER_CANCELLED",
                entityType: "Order",
                entityId: "order-555",
                oldValue: { status: "CONFIRMED" },
                newValue: { status: "CANCELLED" },
                ipAddress: "203.0.113.1",
                userAgent: "SupportTool",
                createdAt: mockDate,
                actor: null,
            });

            const result = await auditLogService.getLogById("log-100");

            expect(result).toBeDefined();
            expect(result?.entityId).toBe("order-555");
            expect(result?.action).toBe("ORDER_CANCELLED");
        });

        it("returns null when record is not found", async () => {
            prismaMock.auditLog.findUnique.mockResolvedValue(null);

            const result = await auditLogService.getLogById("non-existent-id");
            expect(result).toBeNull();
        });
    });
});
