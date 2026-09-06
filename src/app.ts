import Fastify, { type FastifyInstance } from "fastify";
import "dotenv/config.js";
import { appRateLimit } from "./plugins/rate_limit.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { mailTransporter } from "./lib/mail.js";
import authRouter from "./modules/auth/auth.route.js";
import userRouter from "./modules/user/user.route.js";
import authorizationRouter from "./modules/authorization/authorization.route.js";
import catalogRouter from "./modules/catalog/routes/catalog.route.js";
import inventoryRouter from "./modules/inventory/routes/inventory.route.js";
import cartRouter from "./modules/cart/routes/cart.route.js";
import wishlistRouter from "./modules/wishlists/routes/wishlist.route.js";
import orderRouter from "./modules/orders/routes/order.route.js";
import paymentRouter from "./modules/payments/routes/payment.route.js";
import outboxRouter from "./modules/outbox/routes/outbox.route.js";
import notificationRouter from "./modules/notifications/routes/notification.route.js";
import couponRouter from "./modules/coupons/routes/coupon.route.js";
import reviewRouter from "./modules/reviews/routes/review.route.js";
import { searchRouter, discoveryRouter } from "./modules/search/routes/search.route.js";
import dashboardRouter from "./modules/dashboard/routes/dashboard.route.js";
import auditLogRouter from "./modules/audit/routes/auditLog.route.js";
import helmetPlugin from "./plugins/helmet.plugin.js";
import { sanitizeInput } from "./common/security/sanitizer.js";
import { generateCsrfToken, setCsrfCookie } from "./common/security/csrf.js";
import cookie from "@fastify/cookie";
import authPlugin from "./plugins/auth.plugin.js";
import { createYoga } from "graphql-yoga";
import { graphqlSchema } from "./graphql/schema.js";
import { preetyLogger } from "./const/logger.config.js";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { apiDescription, swaggerTags } from "./common/docs/apiDescription.js";
import { docsDescriptionHtml } from "./common/docs/docsDescriptionPage.js";
import { ulid } from "ulid";
import { metricsService } from "./common/observability/metrics.service.js";
import healthRouter, { metricsRouter } from "./modules/health/health.route.js";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        ...preetyLogger,
        requestIdHeader: "x-request-id",
        genReqId: (req) => (req.headers["x-request-id"] as string) || `req_${ulid()}`,
        bodyLimit: 1 * 1024 * 1024, // 1MB payload limit
    });

    await app.register(helmetPlugin);

    await app.register(swagger, {
        openapi: {
            info: {
                title: "E-Commerce REST API",
                description: apiDescription,
                version: "1.0.0",
            },
            tags: swaggerTags,
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

    // Dedicated Interactive Documentation Manual Page
    app.get("/docs/description", async (_request, reply) => {
        return reply.type("text/html").send(docsDescriptionHtml);
    });

    const allowedOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
        : [
              "http://localhost:3000",
              "http://localhost:5173",
              "http://127.0.0.1:3000",
              "http://127.0.0.1:5173",
          ];

    await app.register(cors, {
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
                return cb(null, true);
            }
            return cb(new Error("Not allowed by CORS"), false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "X-CSRF-Token",
            "Idempotency-Key",
            "Accept",
        ],
        exposedHeaders: [
            "Content-Range",
            "X-Content-Range",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After",
            "X-CSRF-Token",
        ],
        maxAge: 86400,
    });

    await appRateLimit(app);
    await app.register(cookie);
    await app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB limit per file
        },
    });
    await app.register(authPlugin);

    // Observability hooks: Request ID header attachment and duration measurement
    app.addHook("onRequest", async (request, reply) => {
        reply.header("x-request-id", request.id);
        (request as any).startTime = performance.now();
    });

    app.addHook("onResponse", async (request, reply) => {
        const startTime = (request as any).startTime || performance.now();
        const durationMs = Number((performance.now() - startTime).toFixed(2));
        const route = request.routeOptions?.url || request.url;
        metricsService.recordHttpRequest(request.method, route, reply.statusCode, durationMs);
    });

    // Prototype pollution defense & input sanitization hook
    app.addHook("preValidation", async (request) => {
        if (request.body && typeof request.body === "object") {
            request.body = sanitizeInput(request.body);
        }
        if (request.query && typeof request.query === "object") {
            request.query = sanitizeInput(request.query);
        }
    });

    // CSRF token retrieval endpoint
    app.get("/api/auth/csrf", {
        schema: {
            tags: ["Auth"],
            summary: "Retrieve CSRF protection token for cookie-based state mutations",
            response: {
                200: {
                    type: "object",
                    properties: {
                        success: { type: "boolean" },
                        csrfToken: { type: "string" },
                    },
                },
            },
        },
    }, async (_request, reply) => {
        const token = generateCsrfToken();
        setCsrfCookie(reply, token);
        return reply.status(200).send({
            success: true,
            csrfToken: token,
        });
    });

    app.register(authRouter, { prefix: "/api/auth" });
    app.register(userRouter, { prefix: "/api/user" });
    app.register(authorizationRouter, { prefix: "/api/v1/admin" });
    app.register(catalogRouter, { prefix: "/api/v1" });
    app.register(inventoryRouter, { prefix: "/api/inventory" });
    app.register(cartRouter, { prefix: "/api/cart" });
    app.register(wishlistRouter, { prefix: "/api/wishlist" });
    app.register(orderRouter, { prefix: "/api/orders" });
    app.register(paymentRouter, { prefix: "/api/payments" });
    app.register(outboxRouter, { prefix: "/api/outbox" });
    app.register(notificationRouter, { prefix: "/api/notifications" });
    app.register(couponRouter, { prefix: "/api/coupons" });
    app.register(reviewRouter, { prefix: "/api/reviews" });
    app.register(searchRouter, { prefix: "/api/search" });
    app.register(discoveryRouter, { prefix: "/api/discovery" });
    app.register(dashboardRouter, { prefix: "/api/v1/admin/dashboard" });
    app.register(auditLogRouter, { prefix: "/api/v1/admin/audit-logs" });
    app.register(healthRouter, { prefix: "/health" });
    app.register(metricsRouter, { prefix: "/metrics" });

    app.get("/health", async (_req, reply) => {
        return reply.status(200).send({
            success: true,
            message: "API is running",
            timestamp: new Date().toISOString(),
        });
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



