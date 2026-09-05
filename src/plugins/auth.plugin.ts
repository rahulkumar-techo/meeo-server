import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "@/common/errors/app-error.js";
import { verifyAccessToken, type TokenPayload } from "@/common/utils/token.js";
import { prisma } from "@/lib/prisma.js";
import { requireAllPermissions, requireAnyPermission, requirePermission } from "@/modules/authorization/permission.middleware.js";

export interface AuthorizationContext extends TokenPayload {
	id: string;
	roles: string[];
	permissions: string[];
}

declare module "fastify" {
	interface FastifyRequest {
		user: AuthorizationContext;
	}

	interface FastifyInstance {
		authenticate: (request: FastifyRequest) => Promise<void>;
		requirePermission: (permission: string) => (request: FastifyRequest) => Promise<void>;
		requireAnyPermission: (permissions: string[]) => (request: FastifyRequest) => Promise<void>;
		requireAllPermissions: (permissions: string[]) => (request: FastifyRequest) => Promise<void>;
	}
}

const authPlugin: FastifyPluginAsync = async (app) => {
	app.decorateRequest("user", null as unknown as AuthorizationContext);

	app.decorate("authenticate", async (request: FastifyRequest) => {
		const authorization = request.headers.authorization;
		const [scheme, token] = authorization?.split(" ") ?? [];

		if (scheme !== "Bearer" || !token) {
			throw new AppError("Authentication required", 401);
		}

		let tokenPayload: TokenPayload;
		try {
			tokenPayload = verifyAccessToken(token);
		} catch {
			throw new AppError("Invalid or expired access token", 401);
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: tokenPayload.userId },
				select: {
					id: true,
					email: true,
					status: true,
					roles: {
						select: {
							role: {
								select: {
									name: true,
									permissions: {
										select: { permission: { select: { name: true } } },
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

			if (tokenPayload.sessionId) {
				const session = await prisma.userSession.findUnique({
					where: { id: tokenPayload.sessionId },
					select: { userId: true, expiresAt: true, revokedAt: true },
				});

				if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt < new Date()) {
					throw new AppError("Invalid or expired session", 401);
				}
			}

			const roles = user.roles.map(({ role }) => role.name);
			const permissions = [...new Set(user.roles.flatMap(({ role }) =>
				role.permissions.map(({ permission }) => permission.name),
			))];

			request.user = {
				...tokenPayload,
				id: user.id,
				email: user.email ?? tokenPayload.email,
				roles,
				permissions,
			};
		} catch {
			throw new AppError("Authentication context unavailable", 401);
		}
	});

	app.decorate("requirePermission", requirePermission);
	app.decorate("requireAnyPermission", requireAnyPermission);
	app.decorate("requireAllPermissions", requireAllPermissions);
};

export default fp(authPlugin);
