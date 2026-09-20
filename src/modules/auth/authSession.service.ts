import { prisma } from "@/lib/prisma.js";
import type {
    AuthLoginOption,
    GoogleLoginInput,
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
        user: { id: string; email: string; firstName?: string | null | undefined; lastName?: string | null | undefined },
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

        return {
            user: {
                id: user.id,
                firstName: user.firstName ?? null,
                lastName: user.lastName ?? null,
                email: user.email,
            },
            accessToken,
            refreshToken,
        };
    }

    async login(payload: AuthLoginOption, metadata?: { ipAddress?: string; userAgent?: string }) {
        const { email, password, deviceName, deviceId } = payload;

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            throw new AppError("Invalid email or password", 401);
        }

        const isPasswordValid = await argon2.verify(user.passwordHash, password);

        if (!isPasswordValid) {
            throw new AppError("Invalid email or password", 401);
        }

        if (!user.emailVerified) {
            throw new AppError("Please verify your email before logging in", 403);
        }

        if (user.status !== "ACTIVE") {
            throw new AppError(`Account is ${user.status.toLowerCase().replaceAll("_", " ")}`, 403);
        }

        return this.issueUserSessionAndTokens(
            { id: user.id, email: user.email!, firstName: user.firstName, lastName: user.lastName },
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

        const profileResult = {
            id: user.id,
            userId: user.id,
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

        let user = await prisma.user.findFirst({
            where: { email: googleUser.email, deletedAt: null },
        });

        if (user) {
            if (user.status !== "ACTIVE") {
                throw new AppError(`Account is ${user.status.toLowerCase().replaceAll("_", " ")}`, 403);
            }

            if (!user.emailVerified || (!user.avatarUrl && googleUser.avatarUrl)) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        emailVerified: true,
                        ...(user.avatarUrl ? {} : { avatarUrl: googleUser.avatarUrl }),
                        lastLoginAt: new Date(),
                    },
                });
            } else {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() },
                });
            }
        } else {
            const randomPasswordHash = await argon2.hash(crypto.randomBytes(32).toString("hex"));

            user = await prisma.user.create({
                data: {
                    email: googleUser.email,
                    firstName: googleUser.firstName,
                    lastName: googleUser.lastName,
                    avatarUrl: googleUser.avatarUrl,
                    emailVerified: true,
                    passwordHash: randomPasswordHash,
                    status: "ACTIVE",
                    lastLoginAt: new Date(),
                },
            });
        }

        return this.issueUserSessionAndTokens(
            { id: user.id, email: user.email!, firstName: user.firstName, lastName: user.lastName },
            { deviceId, deviceName, metadata }
        );
    }
}

export const authSessionService = new AuthSessionService();
