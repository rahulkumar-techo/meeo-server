import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import helmet from "@fastify/helmet";

const helmetPlugin: FastifyPluginAsync = async (app) => {
    await app.register(helmet, {
        global: true,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                imgSrc: ["'self'", "data:", "https:", "https://ik.imagekit.io", "https://validator.swagger.io"],
                objectSrc: ["'none'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'", // Required by Swagger UI & GraphQL Yoga sandbox
                    "'unsafe-eval'",
                    "https://cdn.jsdelivr.net",
                    "https://unpkg.com",
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdn.jsdelivr.net",
                    "https://unpkg.com",
                ],
                upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        crossOriginResourcePolicy: { policy: "cross-origin" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        strictTransportSecurity: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        xContentTypeOptions: true,
        xDnsPrefetchControl: { allow: false },
        xDownloadOptions: true,
        xFrameOptions: { action: "deny" },
        xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
        xXssProtection: true,
    });

    // Custom Permissions-Policy header
    app.addHook("onSend", async (_request, reply) => {
        reply.header(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(self)",
        );
    });
};

export default fp(helmetPlugin, { name: "app-helmet" });
