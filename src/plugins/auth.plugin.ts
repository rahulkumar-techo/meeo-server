import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "@/common/errors/app-error.js";
import { verifyAccessToken, type TokenPayload } from "@/common/utils/token.js";
import { getAuthContext, setAuthContext } from "@/common/utils/auth-cache.js";
import { prisma } from "@/lib/prisma.js";
import { requireAllPermissions, requireAnyPermission, requirePermission } from "@/modules/authorization/permission.middleware.js";

export interface AuthorizationContext extends TokenPayload {
	id: string;
	roles: string[];
	permissions: string[];
	firstName?: string | null;
	lastName?: string | null;
	phone?: string | null;
	avatarUrl?: string | null;
	emailVerified?: boolean;
	phoneVerified?: boolean;
	status?: string;
	createdAt?: string;
	updatedAt?: string;
	roleDetails?: Array<{
		id?: string;
		name?: string;
		description?: string | null;
		permissions?: Array<{
			id?: string;
			name?: string;
			description?: string | null;
		}>;
	}>;
	sessionExpiresAt?: string;
}

declare module "fastify" {
	interface FastifyRequest {
		user: AuthorizationContext;
	}

	interface FastifyInstance {
		authenticate: (request: FastifyRequest) => Promise<void>;
		optionalAuthenticate: (request: FastifyRequest) => Promise<void>;
		requirePermission: (permission: string) => (request: FastifyRequest) => Promise<void>;
		requireAnyPermission: (permissions: string[]) => (request: FastifyRequest) => Promise<void>;
		requireAllPermissions: (permissions: string[]) => (request: FastifyRequest) => Promise<void>;
	}
}

const authPlugin: FastifyPluginAsync = async (app) => {
	app.decorateRequest("user", null as unknown as AuthorizationContext);

	// Route preHandler: validates the bearer token (or accessToken cookie in browser), confirms the user/session is active,
	// then loads roles and deduplicated permissions onto request.user.
	app.decorate("authenticate", async (request: FastifyRequest) => {
		const authorization = request.headers.authorization;
		const [scheme, tokenFromHeader] = authorization?.split(" ") ?? [];
		const token = (scheme === "Bearer" && tokenFromHeader) ? tokenFromHeader : request.cookies?.accessToken;

		if (!token) {
			throw new AppError("Authentication required", 401);
		}

		let tokenPayload: TokenPayload;
		try {
			tokenPayload = verifyAccessToken(token);
		} catch {
			throw new AppError("Invalid or expired access token", 401);
		}

		try {
			const cachedContext = await getAuthContext(tokenPayload.userId, tokenPayload.sessionId);
			if (cachedContext) {
				request.user = {
					...tokenPayload,
					...cachedContext,
					id: cachedContext.id ?? cachedContext.userId ?? tokenPayload.userId,
					userId: cachedContext.userId ?? tokenPayload.userId,
					email: cachedContext.email ?? tokenPayload.email,
				};
				return;
			}

			const user = await prisma.user.findUnique({
				where: { id: tokenPayload.userId },
				select: {
					id: true,
					email: true,
					firstName: true,
					lastName: true,
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

			if (!user || user.status !== "ACTIVE") {
				throw new AppError("Authentication required", 401);
			}

			let sessionExpiresAt: Date | undefined;
			if (tokenPayload.sessionId) {
				const session = await prisma.userSession.findUnique({
					where: { id: tokenPayload.sessionId },
					select: { userId: true, expiresAt: true, revokedAt: true },
				});

				if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt < new Date()) {
					throw new AppError("Invalid or expired session", 401);
				}

				sessionExpiresAt = session.expiresAt;
			}

			const roles = (user.roles ?? []).map(({ role }) => role?.name).filter(Boolean) as string[];
			const permissions = [...new Set((user.roles ?? []).flatMap(({ role }) =>
				(role?.permissions ?? []).map(({ permission }) => permission?.name).filter(Boolean),
			))] as string[];
			const roleDetails = (user.roles ?? []).map(({ role }) => ({
				id: role?.id,
				name: role?.name,
				description: role?.description ?? null,
				permissions: (role?.permissions ?? []).map(({ permission }) => ({
					id: permission?.id,
					name: permission?.name,
					description: permission?.description ?? null,
				})),
			}));

			const authContext = {
				id: user.id,
				userId: user.id,
				email: user.email ?? tokenPayload.email,
				firstName: user.firstName ?? null,
				lastName: user.lastName ?? null,
				phone: user.phone ?? null,
				avatarUrl: user.avatarUrl ?? null,
				emailVerified: Boolean(user.emailVerified),
				phoneVerified: Boolean(user.phoneVerified),
				status: user.status ?? "ACTIVE",
				createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
				updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
				roles,
				permissions,
				roleDetails,
				...(tokenPayload.sessionId ? { sessionId: tokenPayload.sessionId } : {}),
				...(sessionExpiresAt ? { sessionExpiresAt: sessionExpiresAt.toISOString() } : {}),
			};

			await setAuthContext(authContext);

			request.user = {
				...tokenPayload,
				...authContext,
				email: user.email ?? tokenPayload.email,
			};
		} catch (error) {
			if (error instanceof AppError) {
				throw error;
			}
			console.error("[Auth Plugin Unexpected Error]:", error);
			throw new AppError("Authentication context unavailable", 401);
		}
	});

	// Optional authentication: attempts to authenticate the user if token is provided via header or cookie,
	// but gracefully continues for guest requests if no token is present.
	app.decorate("optionalAuthenticate", async (request: FastifyRequest) => {
		const authorization = request.headers.authorization;
		const [scheme, tokenFromHeader] = authorization?.split(" ") ?? [];
		const token = (scheme === "Bearer" && tokenFromHeader) ? tokenFromHeader : request.cookies?.accessToken;

		if (!token) {
			return;
		}

		try {
			await app.authenticate(request);
		} catch {
			// Token invalid or expired: proceed as unauthenticated guest
			request.user = null as unknown as AuthorizationContext;
		}
	});

	app.decorate("requirePermission", requirePermission);
	app.decorate("requireAnyPermission", requireAnyPermission);
	app.decorate("requireAllPermissions", requireAllPermissions);
};

export default fp(authPlugin);
