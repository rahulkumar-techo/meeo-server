import { prisma } from "@/lib/prisma.js";
import type {
    AuthLoginOption,
    GoogleLoginInput,
    SetPasswordInput,
    ChangePasswordInput,
    LinkGoogleInput,
} from "./auth.validation.js";
import argon2 from "argon2";
import { AppError } from "@/common/errors/app-error.js";
import { generateAccessToken, generateRefreshToken, hashToken, verifyRefreshToken } from "@/common/utils/token.js";
import crypto from "crypto";
import { getAuthContext, invalidateAuthContext, setAuthContext } from "@/common/utils/auth-cache.js";
import { verifyGoogleIdToken } from "./googleAuth.service.js";

export interface SessionCreationOptions {
    deviceId?: string | undefined;
    deviceName?: string | undefined;
    metadata?: { ipAddress?: string | undefined; userAgent?: string | undefined } | undefined;
}

export class AuthSessionService {
    async issueUserSessionAndTokens(
        user: { id: string; email: string; firstName?: string | null | undefined; lastName?: string | null | undefined; phone?: string | null | undefined },
        options?: SessionCreationOptions
    ) {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const sessionId = crypto.randomUUID();

        const refreshToken = generateRefreshToken({
            userId: user.id,
            email: user.email,
            sessionId,
        });

        const sessionData = {
            id: sessionId,
            userId: user.id,
            refreshTokenHash: hashToken(refreshToken),
            ...(options?.deviceName ? { deviceName: options.deviceName } : {}),
            ...(options?.deviceId ? { deviceId: options.deviceId } : {}),
            ...(options?.metadata?.ipAddress ? { ipAddress: options.metadata.ipAddress } : {}),
            ...(options?.metadata?.userAgent ? { userAgent: options.metadata.userAgent } : {}),
            expiresAt,
        };

        await prisma.userSession.create({
            data: sessionData,
        });

        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email,
            sessionId,
        });

        const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.firstName || null;

        return {
            user: {
                id: user.id,
                name,
                firstName: user.firstName ?? null,
                lastName: user.lastName ?? null,
                email: user.email,
                phone: user.phone ?? null,
            },
            accessToken,
            refreshToken,
        };
    }

    async login(payload: AuthLoginOption, metadata?: { ipAddress?: string; userAgent?: string }) {
        const { email, password, deviceName, deviceId } = payload;

        const user = await prisma.user.findFirst({
            where: { email, deletedAt: null },
            include: {
                authAccounts: {
                    where: { provider: "PASSWORD" },
                },
            },
        });

        if (!user) {
            throw new AppError("Invalid email or password", 401);
        }

        const passwordAccount = user.authAccounts[0];
        const hashToVerify = passwordAccount?.passwordHash || user.passwordHash;

        if (!hashToVerify) {
            throw new AppError("Invalid email or password", 401);
        }

        const isPasswordValid = await argon2.verify(hashToVerify, password);

        if (!isPasswordValid) {
            throw new AppError("Invalid email or password", 401);
        }

        if (!user.emailVerified) {
            throw new AppError("Please verify your email before logging in", 403);
        }

        if (user.status !== "ACTIVE") {
            throw new AppError(`Account is ${user.status.toLowerCase().replaceAll("_", " ")}`, 403);
        }

        // Lazy-migrate to authAccount if not already linked
        if (!passwordAccount) {
            await prisma.authAccount.create({
                data: {
                    userId: user.id,
                    provider: "PASSWORD",
                    providerAccountId: user.email || user.id,
                    passwordHash: hashToVerify,
                    lastUsedAt: new Date(),
                },
            }).catch(() => null);
        } else {
            await prisma.authAccount.update({
                where: { id: passwordAccount.id },
                data: { lastUsedAt: new Date() },
            }).catch(() => null);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        return this.issueUserSessionAndTokens(
            { id: user.id, email: user.email!, firstName: user.firstName, lastName: user.lastName, phone: user.phone },
            { deviceId, deviceName, metadata }
        );
    }

    async refreshToken(refreshToken: string) {
        let payload: ReturnType<typeof verifyRefreshToken>;

        try {
            payload = verifyRefreshToken(refreshToken);
        } catch {
            throw new AppError("Invalid or expired refresh token", 401);
        }

        const tokenHash = hashToken(refreshToken);

        const session = await prisma.userSession.findUnique({
            where: { id: payload.sessionId },
        });

        if (!session || session.userId !== payload.userId || session.revokedAt) {
            throw new AppError("Invalid refresh token", 401);
        }

        if (session.refreshTokenHash !== tokenHash) {
            await prisma.userSession.deleteMany({
                where: { id: session.id },
            });
            throw new AppError("Refresh token is invalid", 401);
        }

        if (session.expiresAt < new Date()) {
            await prisma.userSession.deleteMany({
                where: { id: session.id },
            });
            throw new AppError("Session expired", 401);
        }

        const newRefreshToken = generateRefreshToken({
            userId: payload.userId,
            email: payload.email,
            sessionId: session.id,
        });

        const rotation = await prisma.userSession.updateMany({
            where: {
                id: session.id,
                refreshTokenHash: tokenHash,
                revokedAt: null,
            },
            data: {
                refreshTokenHash: hashToken(newRefreshToken),
                lastUsedAt: new Date(),
            },
        });

        if (rotation.count !== 1) {
            throw new AppError("Refresh token is invalid", 401);
        }

        const accessToken = generateAccessToken({
            userId: payload.userId,
            email: payload.email,
            sessionId: session.id,
        });

        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    }

    async logout(userId: string, sessionId: string) {
        if (!sessionId) return;

        await prisma.userSession.updateMany({
            where: { id: sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        await invalidateAuthContext(userId, sessionId);
    }

    async listSessions(userId: string) {
        return prisma.userSession.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                deviceName: true,
                deviceId: true,
                ipAddress: true,
                userAgent: true,
                expiresAt: true,
                lastUsedAt: true,
                revokedAt: true,
                createdAt: true,
            },
        });
    }

    async revokeSession(userId: string, sessionId: string) {
        const result = await prisma.userSession.updateMany({
            where: { id: sessionId, userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });

        if (result.count !== 1) throw new AppError("Session not found", 404);
        await invalidateAuthContext(userId, sessionId);
        return { revoked: true };
    }

    async revokeAllSessions(userId: string) {
        const result = await prisma.userSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });

        await invalidateAuthContext(userId);
        return { revoked: result.count };
    }

    formatUserResponse(profile: any) {
        const roles: string[] = profile.roles ?? [];
        const isStandardCustomer = roles.length === 0 || (roles.length === 1 && roles[0]?.toUpperCase() === "CUSTOMER");

        if (isStandardCustomer) {
            const { permissions: _p, roleDetails: _r, ...leanCustomerPayload } = profile;
            return leanCustomerPayload;
        }

        return profile;
    }

    async getCurrentUser(userId: string, sessionId?: string) {
        const cached = await getAuthContext(userId, sessionId);
        if (cached) {
            return this.formatUserResponse(cached);
        }

        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatarUrl: true,
                emailVerified: true,
                phoneVerified: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                roles: {
                    select: {
                        role: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                permissions: {
                                    select: {
                                        permission: {
                                            select: {
                                                id: true,
                                                name: true,
                                                description: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const roles = (user.roles ?? []).map((r) => r.role?.name).filter(Boolean) as string[];
        const permissions = Array.from(
            new Set(
                (user.roles ?? []).flatMap((r) =>
                    (r.role?.permissions ?? []).map((p) => p.permission?.name).filter(Boolean)
                )
            )
        ) as string[];

        const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.firstName || null;

        const profileResult = {
            id: user.id,
            userId: user.id,
            name,
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            email: user.email ?? null,
            phone: user.phone ?? null,
            avatarUrl: user.avatarUrl ?? null,
            emailVerified: Boolean(user.emailVerified),
            phoneVerified: Boolean(user.phoneVerified),
            status: user.status ?? "ACTIVE",
            createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
            roles,
            permissions,
            roleDetails: (user.roles ?? []).map((r) => ({
                id: r.role?.id,
                name: r.role?.name,
                description: r.role?.description ?? null,
                permissions: (r.role?.permissions ?? []).map((p) => ({
                    id: p.permission?.id,
                    name: p.permission?.name,
                    description: p.permission?.description ?? null,
                })),
            })),
            ...(sessionId ? { sessionId } : {}),
        };

        await setAuthContext(profileResult);
        return this.formatUserResponse(profileResult);
    }

    async authenticateWithGoogle(
        payload: GoogleLoginInput,
        metadata?: { ipAddress?: string; userAgent?: string }
    ) {
        const { idToken, deviceName, deviceId } = payload;
        const googleUser = await verifyGoogleIdToken(idToken);

        // 1. Check if an AuthAccount already exists for this Google sub
        const existingGoogleAccount = await prisma.authAccount.findUnique({
            where: {
                provider_providerAccountId_unique: {
                    provider: "GOOGLE",
                    providerAccountId: googleUser.googleId,
                },
            },
            include: { user: true },
        });

        let targetUser: any;

        if (existingGoogleAccount) {
            targetUser = existingGoogleAccount.user;

            if (targetUser.deletedAt) {
                throw new AppError("Account has been deleted", 403);
            }
            if (targetUser.status !== "ACTIVE") {
                throw new AppError(`Account is ${targetUser.status.toLowerCase().replaceAll("_", " ")}`, 403);
            }

            // Update lastUsedAt on authAccount & lastLoginAt on user
            await prisma.$transaction([
                prisma.authAccount.update({
                    where: { id: existingGoogleAccount.id },
                    data: { lastUsedAt: new Date() },
                }),
                prisma.user.update({
                    where: { id: targetUser.id },
                    data: {
                        lastLoginAt: new Date(),
                        ...(targetUser.avatarUrl ? {} : { avatarUrl: googleUser.avatarUrl }),
                    },
                }),
            ]);
        } else {
            // 2. Check if a user with this email already exists
            const existingUserByEmail = await prisma.user.findFirst({
                where: { email: googleUser.email, deletedAt: null },
                include: { authAccounts: true },
            });

            if (existingUserByEmail) {
                if (existingUserByEmail.status !== "ACTIVE") {
                    throw new AppError(`Account is ${existingUserByEmail.status.toLowerCase().replaceAll("_", " ")}`, 403);
                }

                // Account linking policy:
                // Existing account with matching verified email links Google atomically
                targetUser = await prisma.$transaction(async (tx) => {
                    await tx.authAccount.create({
                        data: {
                            userId: existingUserByEmail.id,
                            provider: "GOOGLE",
                            providerAccountId: googleUser.googleId,
                            lastUsedAt: new Date(),
                        },
                    });

                    return tx.user.update({
                        where: { id: existingUserByEmail.id },
                        data: {
                            emailVerified: true,
                            lastLoginAt: new Date(),
                            ...(existingUserByEmail.avatarUrl ? {} : { avatarUrl: googleUser.avatarUrl }),
                        },
                    });
                });
            } else {
                // 3. Brand new user registering via Google
                targetUser = await prisma.$transaction(async (tx) => {
                    return tx.user.create({
                        data: {
                            email: googleUser.email,
                            firstName: googleUser.firstName,
                            lastName: googleUser.lastName,
                            avatarUrl: googleUser.avatarUrl,
                            emailVerified: true,
                            status: "ACTIVE",
                            lastLoginAt: new Date(),
                            roles: {
                                create: {
                                    role: {
                                        connectOrCreate: {
                                            where: { name: "CUSTOMER" },
                                            create: { name: "CUSTOMER", description: "Default customer role" },
                                        },
                                    },
                                },
                            },
                            authAccounts: {
                                create: {
                                    provider: "GOOGLE",
                                    providerAccountId: googleUser.googleId,
                                    lastUsedAt: new Date(),
                                },
                            },
                        },
                    });
                });
            }
        }

        return this.issueUserSessionAndTokens(
            { id: targetUser.id, email: targetUser.email!, firstName: targetUser.firstName, lastName: targetUser.lastName, phone: targetUser.phone },
            { deviceId, deviceName, metadata }
        );
    }

    async setPassword(userId: string, payload: SetPasswordInput) {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: {
                authAccounts: {
                    where: { provider: "PASSWORD" },
                },
            },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const hasPasswordAccount = user.authAccounts.some((a) => a.provider === "PASSWORD") || Boolean(user.passwordHash);
        if (hasPasswordAccount) {
            throw new AppError("Password already set. Use change password instead.", 400);
        }

        const passwordHash = await argon2.hash(payload.password, { type: argon2.argon2id });

        await prisma.$transaction(async (tx) => {
            await tx.authAccount.create({
                data: {
                    userId: user.id,
                    provider: "PASSWORD",
                    providerAccountId: user.email || user.id,
                    passwordHash,
                    lastUsedAt: new Date(),
                },
            });

            await tx.user.update({
                where: { id: user.id },
                data: { passwordHash },
            });
        });

        await invalidateAuthContext(userId);
        return { success: true, message: "Password set successfully" };
    }

    async changePassword(userId: string, payload: ChangePasswordInput, currentSessionId?: string) {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: {
                authAccounts: {
                    where: { provider: "PASSWORD" },
                },
            },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const passwordAccount = user.authAccounts[0];
        const currentHash = passwordAccount?.passwordHash || user.passwordHash;

        if (!currentHash) {
            throw new AppError("No password set for this account. Use set password instead.", 400);
        }

        const isValid = await argon2.verify(currentHash, payload.currentPassword);
        if (!isValid) {
            throw new AppError("Current password is incorrect", 400);
        }

        const newHash = await argon2.hash(payload.newPassword, { type: argon2.argon2id });

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: user.id },
                data: { passwordHash: newHash },
            });

            if (passwordAccount) {
                await tx.authAccount.update({
                    where: { id: passwordAccount.id },
                    data: { passwordHash: newHash, lastUsedAt: new Date() },
                });
            } else {
                await tx.authAccount.create({
                    data: {
                        userId: user.id,
                        provider: "PASSWORD",
                        providerAccountId: user.email || user.id,
                        passwordHash: newHash,
                        lastUsedAt: new Date(),
                    },
                });
            }

            // Revoke other active sessions for security
            if (currentSessionId) {
                await tx.userSession.updateMany({
                    where: {
                        userId: user.id,
                        id: { not: currentSessionId },
                        revokedAt: null,
                    },
                    data: { revokedAt: new Date() },
                });
            }
        });

        await invalidateAuthContext(userId);
        return { success: true, message: "Password changed successfully" };
    }

    async linkGoogle(userId: string, payload: LinkGoogleInput) {
        const googleUser = await verifyGoogleIdToken(payload.idToken);

        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: { authAccounts: true },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Check if Google ID is already linked to any account
        const existingGoogleAccount = await prisma.authAccount.findUnique({
            where: {
                provider_providerAccountId_unique: {
                    provider: "GOOGLE",
                    providerAccountId: googleUser.googleId,
                },
            },
        });

        if (existingGoogleAccount) {
            if (existingGoogleAccount.userId === userId) {
                throw new AppError("This Google account is already linked to your profile", 400);
            }
            throw new AppError("This Google account is already linked to another user", 409);
        }

        // Check if current user already has a Google account attached
        const alreadyHasGoogle = user.authAccounts.some((a) => a.provider === "GOOGLE");
        if (alreadyHasGoogle) {
            throw new AppError("You already have a Google account linked", 400);
        }

        await prisma.$transaction(async (tx) => {
            await tx.authAccount.create({
                data: {
                    userId: user.id,
                    provider: "GOOGLE",
                    providerAccountId: googleUser.googleId,
                    lastUsedAt: new Date(),
                },
            });

            if (!user.avatarUrl && googleUser.avatarUrl) {
                await tx.user.update({
                    where: { id: user.id },
                    data: { avatarUrl: googleUser.avatarUrl },
                });
            }
        });

        await invalidateAuthContext(userId);
        return { success: true, message: "Google account linked successfully" };
    }

    async unlinkProvider(userId: string, provider: "PASSWORD" | "GOOGLE") {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: { authAccounts: true },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const hasLegacyPassword = Boolean(user.passwordHash && !user.authAccounts.some((a) => a.provider === "PASSWORD"));
        const effectiveCount = user.authAccounts.length + (hasLegacyPassword ? 1 : 0);

        // Security rule: Never allow removing the last remaining authentication method
        if (effectiveCount <= 1) {
            throw new AppError("Cannot remove your only sign-in method", 400);
        }

        const targetAccount = user.authAccounts.find((a) => a.provider === provider);
        if (!targetAccount && !(provider === "PASSWORD" && user.passwordHash)) {
            throw new AppError(`No ${provider.toLowerCase()} authentication method linked to your account`, 404);
        }

        await prisma.$transaction(async (tx) => {
            if (targetAccount) {
                await tx.authAccount.delete({
                    where: { id: targetAccount.id },
                });
            }

            if (provider === "PASSWORD") {
                await tx.user.update({
                    where: { id: user.id },
                    data: { passwordHash: null },
                });
            }
        });

        await invalidateAuthContext(userId);
        return { success: true, message: `${provider} authentication method removed successfully` };
    }

    async listAuthAccounts(userId: string) {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: {
                authAccounts: {
                    select: {
                        provider: true,
                        createdAt: true,
                        lastUsedAt: true,
                    },
                },
            },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const accounts = [...user.authAccounts];
        if (user.passwordHash && !accounts.some((a) => a.provider === "PASSWORD")) {
            accounts.push({
                provider: "PASSWORD" as any,
                createdAt: user.createdAt,
                lastUsedAt: null,
            });
        }

        return { accounts };
    }
}

export const authSessionService = new AuthSessionService();
