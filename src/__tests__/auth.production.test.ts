import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock, prismaMock, googleAuthMock } = vi.hoisted(() => ({
    redisMock: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
    prismaMock: {
        $transaction: vi.fn(async (cb: any) => (typeof cb === "function" ? cb(prismaMock) : Promise.all(cb))),
        user: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
        },
        authAccount: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            upsert: vi.fn(),
        },
        userSession: {
            create: vi.fn(),
            findUnique: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        outboxEvent: {
            create: vi.fn(),
        },
    },
    googleAuthMock: {
        verifyGoogleIdToken: vi.fn(),
    },
}));

vi.mock("@/lib/redis.js", () => ({ default: redisMock }));
vi.mock("../lib/redis.js", () => ({ default: redisMock }));
vi.mock("@/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../modules/auth/googleAuth.service.js", () => ({
    verifyGoogleIdToken: googleAuthMock.verifyGoogleIdToken,
}));
vi.mock("@/modules/auth/googleAuth.service.js", () => ({
    verifyGoogleIdToken: googleAuthMock.verifyGoogleIdToken,
}));
vi.mock("@/common/utils/auth-cache.js", () => ({
    getAuthContext: vi.fn().mockResolvedValue(null),
    setAuthContext: vi.fn().mockResolvedValue(true),
    invalidateAuthContext: vi.fn().mockResolvedValue(true),
}));

import { authSessionService } from "../modules/auth/authSession.service.js";
import { authService } from "../modules/auth/auth.service.js";
import { AppError } from "../common/errors/app-error.js";
import argon2 from "argon2";

describe("Production Authentication System", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_ACCESS_SECRET = "test-access-secret-32-chars-long-minimum!";
        process.env.JWT_REFRESH_SECRET = "test-refresh-secret-32-chars-long-minimum!";
    });

    describe("Password Login with AuthAccount", () => {
        it("authenticates successfully when password matches AuthAccount hash", async () => {
            const password = "ValidPassword123!";
            const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-1",
                email: "user@example.com",
                firstName: "Jane",
                lastName: "Doe",
                emailVerified: true,
                status: "ACTIVE",
                authAccounts: [
                    {
                        id: "acc-1",
                        provider: "PASSWORD",
                        providerAccountId: "user@example.com",
                        passwordHash,
                    },
                ],
            });
            prismaMock.authAccount.update.mockResolvedValue({});
            prismaMock.user.update.mockResolvedValue({});
            prismaMock.userSession.create.mockResolvedValue({});

            const result = await authService.login({
                email: "user@example.com",
                password,
            });

            expect(result.user.id).toBe("user-1");
            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
        });

        it("rejects login when password is incorrect", async () => {
            const passwordHash = await argon2.hash("CorrectPassword123!", { type: argon2.argon2id });

            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-1",
                email: "user@example.com",
                emailVerified: true,
                status: "ACTIVE",
                authAccounts: [
                    {
                        id: "acc-1",
                        provider: "PASSWORD",
                        passwordHash,
                    },
                ],
            });

            await expect(
                authService.login({
                    email: "user@example.com",
                    password: "WrongPassword!",
                })
            ).rejects.toThrow(new AppError("Invalid email or password", 401));
        });

        it("rejects login if account is suspended", async () => {
            const password = "ValidPassword123!";
            const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-1",
                email: "user@example.com",
                emailVerified: true,
                status: "SUSPENDED",
                authAccounts: [
                    {
                        id: "acc-1",
                        provider: "PASSWORD",
                        passwordHash,
                    },
                ],
            });

            await expect(
                authService.login({
                    email: "user@example.com",
                    password,
                })
            ).rejects.toThrow(new AppError("Account is suspended", 403));
        });
    });

    describe("Google Authentication & Safe Account Linking", () => {
        it("authenticates existing Google AuthAccount without duplicating user", async () => {
            googleAuthMock.verifyGoogleIdToken.mockResolvedValue({
                googleId: "google-sub-12345",
                email: "user@gmail.com",
                emailVerified: true,
                firstName: "Google",
                lastName: "User",
                avatarUrl: "https://avatar.url",
            });

            prismaMock.authAccount.findUnique.mockResolvedValue({
                id: "acc-google-1",
                userId: "user-google-1",
                provider: "GOOGLE",
                providerAccountId: "google-sub-12345",
                user: {
                    id: "user-google-1",
                    email: "user@gmail.com",
                    firstName: "Google",
                    lastName: "User",
                    status: "ACTIVE",
                    deletedAt: null,
                },
            });
            prismaMock.authAccount.update.mockResolvedValue({});
            prismaMock.user.update.mockResolvedValue({});
            prismaMock.userSession.create.mockResolvedValue({});

            const result = await authService.authenticateWithGoogle({
                idToken: "valid-google-id-token",
            });

            expect(result.user.id).toBe("user-google-1");
            expect(prismaMock.user.create).not.toHaveBeenCalled();
        });

        it("links Google AuthAccount to existing user with verified matching email", async () => {
            googleAuthMock.verifyGoogleIdToken.mockResolvedValue({
                googleId: "google-sub-new-999",
                email: "existing@gmail.com",
                emailVerified: true,
                firstName: "Existing",
                lastName: "User",
                avatarUrl: null,
            });

            // No existing Google AuthAccount for this sub
            prismaMock.authAccount.findUnique.mockResolvedValue(null);

            // Existing password user found with same email
            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-existing-1",
                email: "existing@gmail.com",
                emailVerified: true,
                status: "ACTIVE",
                deletedAt: null,
                authAccounts: [{ provider: "PASSWORD" }],
            });

            prismaMock.authAccount.create.mockResolvedValue({});
            prismaMock.user.update.mockResolvedValue({
                id: "user-existing-1",
                email: "existing@gmail.com",
                firstName: "Existing",
                lastName: "User",
            });
            prismaMock.userSession.create.mockResolvedValue({});

            const result = await authService.authenticateWithGoogle({
                idToken: "valid-google-id-token",
            });

            expect(result.user.id).toBe("user-existing-1");
            expect(prismaMock.authAccount.create).toHaveBeenCalledWith({
                data: {
                    userId: "user-existing-1",
                    provider: "GOOGLE",
                    providerAccountId: "google-sub-new-999",
                    lastUsedAt: expect.any(Date),
                },
            });
        });

        it("creates a new user and Google AuthAccount atomically when no user exists", async () => {
            googleAuthMock.verifyGoogleIdToken.mockResolvedValue({
                googleId: "brand-new-sub",
                email: "newuser@gmail.com",
                emailVerified: true,
                firstName: "New",
                lastName: "Customer",
                avatarUrl: "https://avatar.url",
            });

            prismaMock.authAccount.findUnique.mockResolvedValue(null);
            prismaMock.user.findFirst.mockResolvedValue(null);

            prismaMock.user.create.mockResolvedValue({
                id: "new-user-uuid",
                email: "newuser@gmail.com",
                firstName: "New",
                lastName: "Customer",
            });
            prismaMock.userSession.create.mockResolvedValue({});

            const result = await authService.authenticateWithGoogle({
                idToken: "valid-google-id-token",
            });

            expect(result.user.id).toBe("new-user-uuid");
            expect(prismaMock.user.create).toHaveBeenCalled();
        });
    });

    describe("Password Setup & Management", () => {
        it("allows Google-only user to set a password", async () => {
            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-google-only",
                email: "googleonly@gmail.com",
                passwordHash: null,
                authAccounts: [{ provider: "GOOGLE" }],
            });
            prismaMock.authAccount.create.mockResolvedValue({});
            prismaMock.user.update.mockResolvedValue({});

            const res = await authService.setPassword("user-google-only", {
                password: "NewPassword123!",
            });

            expect(res.success).toBe(true);
            expect(prismaMock.authAccount.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: "user-google-only",
                    provider: "PASSWORD",
                }),
            });
        });

        it("rejects setPassword if password already exists", async () => {
            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-with-pass",
                email: "user@example.com",
                passwordHash: "existing-hash",
                authAccounts: [{ provider: "PASSWORD" }],
            });

            await expect(
                authService.setPassword("user-with-pass", {
                    password: "AnotherPassword123!",
                })
            ).rejects.toThrow(new AppError("Password already set. Use change password instead.", 400));
        });
    });

    describe("Provider Linking & Unlinking Security", () => {
        it("prevents linking a Google account already bound to another user", async () => {
            googleAuthMock.verifyGoogleIdToken.mockResolvedValue({
                googleId: "taken-google-sub",
                email: "taken@gmail.com",
                emailVerified: true,
            });

            prismaMock.user.findFirst.mockResolvedValue({
                id: "current-user-id",
                authAccounts: [{ provider: "PASSWORD" }],
            });

            // Google account is already linked to different user
            prismaMock.authAccount.findUnique.mockResolvedValue({
                id: "acc-other",
                userId: "other-user-id",
                provider: "GOOGLE",
                providerAccountId: "taken-google-sub",
            });

            await expect(
                authService.linkGoogle("current-user-id", {
                    idToken: "valid-token",
                })
            ).rejects.toThrow(new AppError("This Google account is already linked to another user", 409));
        });

        it("prevents removing the last authentication method", async () => {
            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-single-method",
                passwordHash: null,
                authAccounts: [
                    {
                        id: "acc-google",
                        provider: "GOOGLE",
                    },
                ],
            });

            await expect(
                authService.unlinkProvider("user-single-method", "GOOGLE")
            ).rejects.toThrow(new AppError("Cannot remove your only sign-in method", 400));
        });

        it("successfully unlinks when multiple methods exist", async () => {
            prismaMock.user.findFirst.mockResolvedValue({
                id: "user-multi-method",
                passwordHash: "hash",
                authAccounts: [
                    { id: "acc-pass", provider: "PASSWORD" },
                    { id: "acc-google", provider: "GOOGLE" },
                ],
            });
            prismaMock.authAccount.delete.mockResolvedValue({});

            const res = await authService.unlinkProvider("user-multi-method", "GOOGLE");
            expect(res.success).toBe(true);
            expect(prismaMock.authAccount.delete).toHaveBeenCalledWith({
                where: { id: "acc-google" },
            });
        });
    });
});
