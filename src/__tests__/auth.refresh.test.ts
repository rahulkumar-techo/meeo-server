import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-jwt-secret";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";

const { authServiceMock, prismaMock } = vi.hoisted(() => ({
    authServiceMock: {
        login: vi.fn(),
        refreshToken: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
    },
    prismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/auth/auth.service.js", () => ({
    authService: authServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import authRouter from "../modules/auth/auth.route.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { generateAccessToken } from "../common/utils/token.js";

describe("Auth Controller - HttpOnly Cookie & Token Flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(authRouter, { prefix: "/api/auth" });
        return app;
    };

    describe("POST /api/auth/login", () => {
        it("stores tokens in HttpOnly cookies and returns user and accessToken", async () => {
            const app = await createTestApp();
            authServiceMock.login.mockResolvedValue({
                user: { id: "u-1", email: "user@test.com" },
                accessToken: "access-token-123",
                refreshToken: "refresh-token-123",
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/auth/login",
                payload: {
                    email: "user@test.com",
                    password: "password123",
                },
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.success).toBe(true);
            expect(body.data.user).toBeDefined();
            expect(body.data.accessToken).toBe("access-token-123");

            // Verify both cookies are set
            const cookies = res.cookies;
            const refreshCookie = cookies.find((c) => c.name === "refreshToken");
            const accessCookie = cookies.find((c) => c.name === "accessToken");
            expect(refreshCookie?.value).toBe("refresh-token-123");
            expect(accessCookie?.value).toBe("access-token-123");
            await app.close();
        });
    });

    describe("POST /api/auth/refresh", () => {
        it("refreshes from cookie, sets new cookies, and returns new accessToken", async () => {
            const app = await createTestApp();
            authServiceMock.refreshToken.mockResolvedValue({
                accessToken: "new-access-token",
                refreshToken: "new-refresh-token",
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/auth/refresh",
                cookies: {
                    refreshToken: "cookie-refresh-token-456",
                },
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.success).toBe(true);
            expect(body.data.accessToken).toBe("new-access-token");
            expect(authServiceMock.refreshToken).toHaveBeenCalledWith("cookie-refresh-token-456");

            // Cookies updated
            const cookies = res.cookies;
            const refreshCookie = cookies.find((c) => c.name === "refreshToken");
            const accessCookie = cookies.find((c) => c.name === "accessToken");
            expect(refreshCookie?.value).toBe("new-refresh-token");
            expect(accessCookie?.value).toBe("new-access-token");
            await app.close();
        });

        it("refreshes from body payload fallback", async () => {
            const app = await createTestApp();
            authServiceMock.refreshToken.mockResolvedValue({
                accessToken: "new-access-token",
                refreshToken: "new-refresh-token",
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/auth/refresh",
                payload: {
                    refreshToken: "mobile-refresh-token-999",
                },
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.success).toBe(true);
            expect(body.data.accessToken).toBe("new-access-token");
            expect(authServiceMock.refreshToken).toHaveBeenCalledWith("mobile-refresh-token-999");
            await app.close();
        });
    });

    describe("GET /api/auth/me (Cookie-based browser authentication)", () => {
        it("authenticates browser request using accessToken cookie", async () => {
            const app = await createTestApp();
            const token = generateAccessToken({
                userId: "user-abc-123",
                email: "user@test.com",
            });

            prismaMock.user.findUnique.mockResolvedValue({
                id: "user-abc-123",
                email: "user@test.com",
                status: "ACTIVE",
                roles: [],
            });

            authServiceMock.getCurrentUser.mockResolvedValue({
                id: "user-abc-123",
                email: "user@test.com",
                firstName: "John",
                lastName: "Doe",
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/auth/me",
                cookies: {
                    accessToken: token,
                },
            });

            expect(res.statusCode).toBe(200);
            expect(authServiceMock.getCurrentUser).toHaveBeenCalledWith("user-abc-123");
            await app.close();
        });
    });

    describe("POST /api/auth/logout", () => {
        it("clears both refreshToken and accessToken cookies on logout", async () => {
            const app = await createTestApp();
            const token = generateAccessToken({
                userId: "user-abc-123",
                email: "user@test.com",
            });

            prismaMock.user.findUnique.mockResolvedValue({
                id: "user-abc-123",
                email: "user@test.com",
                status: "ACTIVE",
                roles: [],
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/auth/logout",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const cookies = res.cookies;
            const refreshCookie = cookies.find((c) => c.name === "refreshToken");
            const accessCookie = cookies.find((c) => c.name === "accessToken");
            expect(refreshCookie?.maxAge).toBe(0);
            expect(accessCookie?.maxAge).toBe(0);
            await app.close();
        });
    });
});
