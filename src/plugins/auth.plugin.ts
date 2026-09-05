import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "@/common/errors/app-error.js";
import { verifyAccessToken, type TokenPayload } from "@/common/utils/token.js";

declare module "fastify" {
	interface FastifyRequest {
		user: TokenPayload;
	}

	interface FastifyInstance {
		authenticate: (request: FastifyRequest) => Promise<void>;
	}
}

const authPlugin: FastifyPluginAsync = async (app) => {
	app.decorateRequest("user", null as unknown as TokenPayload);

	app.decorate("authenticate", async (request: FastifyRequest) => {
		const authorization = request.headers.authorization;
		const [scheme, token] = authorization?.split(" ") ?? [];

		if (scheme !== "Bearer" || !token) {
			throw new AppError("Authentication required", 401);
		}

		try {
			request.user = verifyAccessToken(token);
		} catch {
			throw new AppError("Invalid or expired access token", 401);
		}
	});
};

export default fp(authPlugin);
