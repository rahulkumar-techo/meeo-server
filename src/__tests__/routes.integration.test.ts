import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authServiceMock, userServiceMock } = vi.hoisted(() => ({
    authServiceMock: {
        register: vi.fn(), login: vi.fn(), verifyOtp: vi.fn(), resendOtp: vi.fn(),
        forgotPassword: vi.fn(), resetPassword: vi.fn(), refreshToken: vi.fn(), getCurrentUser: vi.fn(),
    },
    userServiceMock: {
        updateProfile: vi.fn(), saveAddress: vi.fn(), deleteAddress: vi.fn(),
        requestPhoneOtp: vi.fn(), verifyPhone: vi.fn(),
    },
}));

vi.mock("../modules/auth/auth.service.js", () => ({ authService: authServiceMock }));
vi.mock("../modules/user/services/user.service.js", () => ({ default: userServiceMock }));

import authPlugin from "../plugins/auth.plugin.js";
import authRouter from "../modules/auth/auth.route.js";
import userRouter from "../modules/user/user.route.js";

const dummyUser = { id: "user-001", email: "ada@example.test", firstName: "Ada", lastName: "Lovelace" };

// These tests exercise real route registration and middleware with mocked service boundaries.
describe("auth and user routes (integration)", () => {
    beforeEach(() => vi.clearAllMocks());

    async function createTestApp() {
        const app = Fastify();
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(authRouter, { prefix: "/api/auth" });
        await app.register(userRouter, { prefix: "/api/user" });
        // The route-level serializer can normalize thrown errors; return a schema-valid rejection.
        app.setErrorHandler((error, _request, reply) => {
            const typedError = error as { message?: string };
            return reply.status(401).send({
                success: false,
                message: typedError.message ?? "Authentication required",
            });
        });
        return app;
    }

    it("validates registration at the HTTP boundary and delegates valid data", async () => {
        authServiceMock.register.mockResolvedValue({ user: dummyUser, tempOtp: "2468" });
        const app = await createTestApp();

        const response = await app.inject({
            method: "POST",
            url: "/api/auth/register",
            payload: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", password: "Pass1234" },
        });

        expect(response.statusCode).toBe(201);
        expect(authServiceMock.register).toHaveBeenCalledOnce();
        await app.close();
    });

    it("protects user routes when the bearer token is missing", async () => {
        const app = await createTestApp();

        const response = await app.inject({ method: "PATCH", url: "/api/user/profile", payload: { firstName: "Ada", lastName: "Lovelace" } });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(userServiceMock.updateProfile).not.toHaveBeenCalled();
        await app.close();
    });
});
