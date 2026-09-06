import Fastify, { type FastifyInstance } from "fastify";
import "dotenv/config.js";
import { appRateLimit } from "./plugins/rate_limit.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { mailTransporter } from "./lib/mail.js";
import authRouter from "./modules/auth/auth.route.js";
import userRouter from "./modules/user/user.route.js";
import authorizationRouter from "./modules/authorization/authorization.route.js";
import catalogRouter from "./modules/catalog/routes/catalog.route.js";
import cookie from "@fastify/cookie";
import authPlugin from "./plugins/auth.plugin.js";
import { createYoga } from "graphql-yoga";
import { graphqlSchema } from "./graphql/schema.js";
import { preetyLogger } from "./const/logger.config.js";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { catalogTags } from "./common/docs/catalog.js";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify(preetyLogger);

    await app.register(swagger, {
        openapi: {
            info: {
                title: "E-Commerce API",
                description: "Authentication, RBAC, and Product Catalog Management API",
                version: "1.0.0",
            },
            tags: [
                { name: "Auth", description: "Authentication and account recovery" },
                { name: "User", description: "Authenticated user profile management" },
                { name: "Authorization", description: "Role and permission administration" },
                ...catalogTags,
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                    refreshCookie: {
                        type: "apiKey",
                        in: "cookie",
                        name: "refreshToken",
                    },
                },
            },
        },
    });
    await app.register(swaggerUi, {
        routePrefix: "/docs",
        uiConfig: {
            docExpansion: "list",
            deepLinking: true,
            filter: true,
            displayRequestDuration: true,
            persistAuthorization: true,
        },
    });

    app.register(cors, { 
        origin: true 
    });
    await appRateLimit(app);
    await app.register(cookie);
    await app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB limit per file
        },
    });
    await app.register(authPlugin);

    // app.addHook("onReady", async () => {
    //     await mailTransporter.verify();
    //     app.log.info("Mail server connected successfully");
    // });

    app.register(authRouter, { prefix: "/api/auth" });
    app.register(userRouter, { prefix: "/api/user" });
    app.register(authorizationRouter, { prefix: "/api/v1/admin" });
    app.register(catalogRouter, { prefix: "/api/v1" });

    app.get("/health", async () => {
        return {
            success: true,
            message: "API is running",
            timestamp: new Date().toISOString(),
        };
    });

    // Lightweight endpoint used by the keep-alive cron and external uptime monitors.
    app.get("/ping", {
        schema: {
            tags: ["System"],
            summary: "Check whether the server is awake",
            response: { 200: { type: "string", example: "Awake" } },
        },
    }, async (_request, reply) => {
        return reply.status(200).send("Awake");
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



