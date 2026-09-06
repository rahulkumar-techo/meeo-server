import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "unit-test-access-secret";
process.env.DATABASE_URL = "postgresql://dummy:test@localhost:5432/test";

const { authServiceMock, userServiceMock, prismaMock } = vi.hoisted(() => ({
    authServiceMock: {
        register: vi.fn(), login: vi.fn(), verifyOtp: vi.fn(), resendOtp: vi.fn(),
        forgotPassword: vi.fn(), resetPassword: vi.fn(), refreshToken: vi.fn(), getCurrentUser: vi.fn(),
    },
    userServiceMock: {
        updateProfile: vi.fn(), saveAddress: vi.fn(), deleteAddress: vi.fn(),
        requestPhoneOtp: vi.fn(), verifyPhone: vi.fn(),
    },
    prismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

// The system suite uses safe, deterministic environment values instead of developer credentials.
// The system test uses the real app, routes, validation, middleware, and serializers.
// Only persistence and external service boundaries are replaced with deterministic dummies.
vi.mock("../modules/auth/auth.service.js", () => ({ authService: authServiceMock }));
vi.mock("../modules/user/services/user.service.js", () => ({ default: userServiceMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("graphql-yoga", () => ({
    // Yoga is outside the auth/user workflow and can cause duplicate GraphQL realms in Vitest.
    createYoga: () => ({ fetch: async () => new Response("ok") }),
}));

import { generateAccessToken } from "../common/utils/token.js";
import { buildApp } from "../app.js";

describe("authentication and user system flow", () => {
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeAll(async () => {
        authServiceMock.getCurrentUser.mockResolvedValue({
            id: "user-001",
            email: "ada@example.test",
            firstName: "Ada",
            lastName: "Lovelace",
        });
        prismaMock.user.findUnique.mockResolvedValue({
            id: "user-001",
            email: "ada@example.test",
            status: "ACTIVE",
            roles: [],
        });
        app = await buildApp();
    });

    afterAll(async () => {
        await app?.close();
    });

    it("serves the health endpoint through the complete application", async () => {
        const response = await app.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ success: true, message: "API is running" });
    });

    it("serves the interactive documentation manual page at /docs/description", async () => {
        const response = await app.inject({ method: "GET", url: "/docs/description" });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.body).toContain("Enterprise E-Commerce API Manual");
        expect(response.body).toContain("/api/auth");
        expect(response.body).toContain("/api/inventory");
    });

    it("retrieves the current user with a dummy JWT and no real API call", async () => {
        const token = generateAccessToken({ userId: "user-001", email: "ada@example.test" });
        const response = await app.inject({
            method: "GET",
            url: "/api/auth/me",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ data: { id: "user-001" } });
        expect(authServiceMock.getCurrentUser).toHaveBeenCalledWith("user-001");
    });
});
