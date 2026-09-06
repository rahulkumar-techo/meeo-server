import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../errors/app-error.js";

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generates a cryptographically random CSRF token.
 */
export function generateCsrfToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Validates CSRF double-submit token for cookie-based state-changing HTTP methods.
 * Pure Bearer token requests (e.g. mobile apps / REST clients with Authorization header) bypass CSRF.
 */
export function validateCsrfProtection(request: FastifyRequest) {
    const method = request.method.toUpperCase();

    // Safe read-only HTTP methods are exempt
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        return;
    }

    // Requests with standard Bearer authorization header bypass cookie CSRF
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1]) {
        return;
    }

    // Webhooks bypass CSRF (they use HMAC signatures instead)
    if (request.url.includes("/webhook")) {
        return;
    }

    // For cookie-based state mutating requests, verify double-submit CSRF cookie & header
    const cookieToken = request.cookies[CSRF_COOKIE_NAME];
    const headerToken = request.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!cookieToken || !headerToken) {
        throw new AppError("Invalid or missing CSRF token", 403);
    }

    // Constant-time comparison to prevent timing attacks
    if (cookieToken.length !== headerToken.length) {
        throw new AppError("CSRF token validation failed", 403);
    }

    const isValid = crypto.timingSafeEqual(
        Buffer.from(cookieToken, "utf-8"),
        Buffer.from(headerToken, "utf-8"),
    );

    if (!isValid) {
        throw new AppError("CSRF token validation failed", 403);
    }
}

/**
 * Attaches or refreshes the CSRF cookie on a reply.
 */
export function setCsrfCookie(reply: FastifyReply, token: string) {
    reply.setCookie(CSRF_COOKIE_NAME, token, {
        path: "/",
        httpOnly: false, // Must be readable by JavaScript client to send in X-CSRF-Token header
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 60 * 60 * 24, // 24 hours
    });
}
