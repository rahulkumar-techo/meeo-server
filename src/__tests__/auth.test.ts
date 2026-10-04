import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock, prismaMock } = vi.hoisted(() => ({
    redisMock: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
    prismaMock: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
        },
        outboxEvent: {
            create: vi.fn(),
        },
    },
}));

vi.mock("@/lib/redis.js", () => ({ default: redisMock }));
vi.mock("../lib/redis.js", () => ({ default: redisMock }));
vi.mock("@/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

import { authRegistrationService } from "../modules/auth/authRegistration.service.js";
import { authService } from "../modules/auth/auth.service.js";
import { Keys } from "../const/keys.js";
import { AppError } from "../common/errors/app-error.js";

describe("Password Reset OTP Verification", () => {
    const testEmail = "user@example.test";
    const testOtp = "1234";

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("AuthRegistrationService.verifyResetOtp", () => {
        it("successfully verifies reset OTP and DOES NOT delete the Redis key", async () => {
            redisMock.get.mockResolvedValue(testOtp);

            const result = await authRegistrationService.verifyResetOtp({
                email: testEmail,
                otp: testOtp,
            });

            expect(result).toEqual({ verified: true });
            expect(redisMock.get).toHaveBeenCalledWith(Keys.PASSWORD_RESET_OTP(testEmail));
            // Critical requirement: Must NOT delete the Redis key so it remains valid for reset-password
            expect(redisMock.del).not.toHaveBeenCalled();
        });

        it("throws AppError 400 when reset OTP is invalid", async () => {
            redisMock.get.mockResolvedValue("9999");

            await expect(
                authRegistrationService.verifyResetOtp({
                    email: testEmail,
                    otp: testOtp,
                }),
            ).rejects.toThrowError(new AppError("OTP is invalid or expired", 400));

            expect(redisMock.get).toHaveBeenCalledWith(Keys.PASSWORD_RESET_OTP(testEmail));
            expect(redisMock.del).not.toHaveBeenCalled();
        });

        it("throws AppError 400 when reset OTP is expired or not found", async () => {
            redisMock.get.mockResolvedValue(null);

            await expect(
                authRegistrationService.verifyResetOtp({
                    email: testEmail,
                    otp: testOtp,
                }),
            ).rejects.toThrowError(new AppError("OTP is invalid or expired", 400));

            expect(redisMock.get).toHaveBeenCalledWith(Keys.PASSWORD_RESET_OTP(testEmail));
            expect(redisMock.del).not.toHaveBeenCalled();
        });
    });

    describe("AuthService.verifyResetOtp", () => {
        it("delegates verifyResetOtp to authRegistrationService", async () => {
            redisMock.get.mockResolvedValue(testOtp);

            const result = await authService.verifyResetOtp({
                email: testEmail,
                otp: testOtp,
            });

            expect(result).toEqual({ verified: true });
            expect(redisMock.get).toHaveBeenCalledWith(Keys.PASSWORD_RESET_OTP(testEmail));
            expect(redisMock.del).not.toHaveBeenCalled();
        });
    });

    describe("AuthRegistrationService.register", () => {
        const registrationPayload = {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.test",
            password: "SecurePassword123!",
        };

        it("registers a brand new user and dispatches OTP email", async () => {
            prismaMock.user.findUnique.mockResolvedValue(null);
            prismaMock.user.create.mockResolvedValue({
                id: "user-new",
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.test",
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            redisMock.set.mockResolvedValue("OK");
            prismaMock.outboxEvent.create.mockResolvedValue({ id: "outbox-1" });

            const result = await authRegistrationService.register(registrationPayload);

            expect(result.user.id).toBe("user-new");
            expect(result.tempOtp).toBeDefined();
            expect(prismaMock.user.create).toHaveBeenCalledOnce();
            expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: "USER_REGISTERED",
                        aggregateId: "user-new",
                    }),
                }),
            );
        });

        it("updates details, generates fresh OTP, and dispatches email when user exists but is unverified", async () => {
            prismaMock.user.findUnique.mockResolvedValue({
                id: "user-unverified",
                email: "ada@example.test",
                emailVerified: false,
            });
            prismaMock.user.update.mockResolvedValue({
                id: "user-unverified",
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.test",
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            redisMock.set.mockResolvedValue("OK");
            prismaMock.outboxEvent.create.mockResolvedValue({ id: "outbox-2" });

            const result = await authRegistrationService.register(registrationPayload);

            expect(result.user.id).toBe("user-unverified");
            expect(result.tempOtp).toBeDefined();
            expect(prismaMock.user.create).not.toHaveBeenCalled();
            expect(prismaMock.user.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "user-unverified" },
                }),
            );
            expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: "USER_REGISTERED",
                        aggregateId: "user-unverified",
                    }),
                }),
            );
        });

        it("throws AppError 400 when user exists and email is already verified", async () => {
            prismaMock.user.findUnique.mockResolvedValue({
                id: "user-verified",
                email: "ada@example.test",
                emailVerified: true,
            });

            await expect(
                authRegistrationService.register(registrationPayload),
            ).rejects.toThrowError(new AppError("Email already registered", 400));

            expect(prismaMock.user.create).not.toHaveBeenCalled();
            expect(prismaMock.user.update).not.toHaveBeenCalled();
            expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
        });
    });
});


