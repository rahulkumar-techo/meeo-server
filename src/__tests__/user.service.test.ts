import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, redisMock } = vi.hoisted(() => ({
    prismaMock: {
        user: { findFirst: vi.fn(), update: vi.fn() },
        address: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
    redisMock: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/redis.js", () => ({ default: redisMock }));
vi.mock("../common/utils/generateOtp.js", () => ({ generateOtp: vi.fn(() => "2468") }));

import userService from "../modules/user/services/user.service.js";

// Prisma, Redis, and OTP generation are mocked so this unit suite never needs local services.
describe("UserService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stores a dummy phone OTP without contacting an SMS provider", async () => {
        // A missing duplicate phone means the service should create and cache one OTP.
        prismaMock.user.findFirst.mockResolvedValue(null);

        const result = await userService.requestPhoneOtp("user-001", { phone: "+14155550123" });

        expect(result).toEqual({ tempOtp: "2468" });
        expect(redisMock.set).toHaveBeenCalledWith(
            "auth:phone:user-001",
            JSON.stringify({ phone: "+14155550123", otp: "2468" }),
            "EX",
            300,
        );
    });

    it("updates only the requested user's profile", async () => {
        // Verify both the returned projection and the user ID used by the persistence call.
        prismaMock.user.update.mockResolvedValue({ firstName: "Grace", lastName: "Hopper" });

        const result = await userService.updateProfile("user-002", {
            firstName: "Grace",
            lastName: "Hopper",
        });

        expect(result).toEqual({ firstName: "Grace", lastName: "Hopper" });
        expect(prismaMock.user.update).toHaveBeenCalledWith({
            where: { id: "user-002" },
            data: { firstName: "Grace", lastName: "Hopper" },
        });
    });
});
