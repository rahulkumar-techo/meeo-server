import Fastify, { type FastifyInstance } from "fastify";
import "dotenv/config.js";
import { appRateLimit } from "./plugins/rate_limit.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { mailTransporter } from "./lib/mail.js";
import authRouter from "./modules/auth/auth.route.js";
import userRouter from "./modules/user/user.route.js";
import cookie from "@fastify/cookie";
import authPlugin from "./plugins/auth.plugin.js";
import { createYoga } from "graphql-yoga";
import { graphqlSchema } from "./graphql/schema.js";
import { preetyLogger } from "./const/logger.config.js";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify(preetyLogger);

    await appRateLimit(app);
    await app.register(cookie);
    await app.register(authPlugin);

    // app.addHook("onReady", async () => {
    //     await mailTransporter.verify();
    //     app.log.info("Mail server connected successfully");
    // });



    app.register(authRouter, { prefix: "/api/auth" });
    app.register(userRouter, { prefix: "/api/user" });

    app.get("/health", async () => {
        return {
            success: true,
            message: "API is running",
            timestamp: new Date().toISOString(),
        };
    });

    const yoga = createYoga({
        schema: graphqlSchema,
        graphqlEndpoint: "/graphql",
        landingPage: true,
    });

    app.setErrorHandler(errorHandler);
    
    /// Bind to the Yoga's endpoint to avoid rendering on any path
    app.route({
        url: "/graphql",
        method: ["GET", "POST", "OPTIONS"],

        handler: async (request, reply) => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(request.headers)) {
                if (typeof value === "string") {
                    headers.set(key, value);
                }
            }

            const requestInit: RequestInit = {
                method: request.method,
                headers,
            };
            if (request.method !== "GET") {
                requestInit.body = JSON.stringify(request.body);
            }

            const yogaRequest = new Request(`http://${request.hostname}${request.url}`, requestInit);
            const response = await yoga.fetch(yogaRequest);

            response.headers.forEach((value, key) => reply.header(key, value));
            return reply.status(response.status).send(await response.text());
        },
    });

    return app;
}



