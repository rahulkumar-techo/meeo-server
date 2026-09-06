import type { FastifyRequest } from "fastify";

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

/**
 * Validates whether a string is a well-formed IPv4 or IPv6 address.
 */
export function isValidIp(ip?: string | null): boolean {
    if (!ip || typeof ip !== "string") return false;
    const cleanIp = ip.trim();
    return IPV4_REGEX.test(cleanIp) || IPV6_REGEX.test(cleanIp) || cleanIp === "127.0.0.1" || cleanIp === "::1";
}

/**
 * Resolves the client IP address from proxy headers (Cloudflare, AWS ALB, Nginx) or socket.
 */
export function getClientIp(request: FastifyRequest): string {
    const headers = request.headers;

    // 1. Cloudflare header
    const cfIp = headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && isValidIp(cfIp)) {
        return cfIp.trim();
    }

    // 2. Nginx / reverse proxy Real IP
    const realIp = headers["x-real-ip"];
    if (typeof realIp === "string" && isValidIp(realIp)) {
        return realIp.trim();
    }

    // 3. Standard X-Forwarded-For header (client is the first IP in the comma-separated chain)
    const forwardedFor = headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
        const clientCandidate = forwardedFor.split(",")[0]?.trim();
        if (clientCandidate && isValidIp(clientCandidate)) {
            return clientCandidate;
        }
    }

    // 4. Fastify / Socket remote IP fallback
    if (request.ip && isValidIp(request.ip)) {
        return request.ip;
    }

    return "127.0.0.1";
}
