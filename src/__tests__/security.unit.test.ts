import { describe, expect, it } from "vitest";
import { maskSensitiveData } from "../common/security/masking.js";
import { getClientIp, isValidIp } from "../common/security/clientIp.js";
import { sanitizeInput, sanitizeString } from "../common/security/sanitizer.js";
import { generateCsrfToken, validateCsrfProtection } from "../common/security/csrf.js";

describe("Security Hardening Unit Tests", () => {
    describe("Sensitive Data Masking", () => {
        it("redacts sensitive fields in shallow and deep nested objects", () => {
            const input = {
                username: "johndoe",
                email: "john@example.com",
                password: "SuperSecretPassword123!",
                accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                refreshToken: "refresh-secret-12345",
                profile: {
                    fullName: "John Doe",
                    creditCard: "4111-2222-3333-4444",
                    cvv: "123",
                    secret: "top-secret-val",
                },
                metadata: [
                    { otp: "123456", note: "verification otp" },
                    { authorization: "Bearer secret-token", status: "ok" },
                ],
            };

            const masked = maskSensitiveData(input);

            expect(masked.username).toBe("johndoe");
            expect(masked.email).toBe("john@example.com");
            expect(masked.password).toBe("[REDACTED]");
            expect(masked.accessToken).toBe("[REDACTED]");
            expect(masked.refreshToken).toBe("[REDACTED]");
            expect(masked.profile.fullName).toBe("John Doe");
            expect(masked.profile.creditCard).toBe("[REDACTED]");
            expect(masked.profile.cvv).toBe("[REDACTED]");
            expect(masked.profile.secret).toBe("[REDACTED]");
            const meta0 = masked.metadata[0]!;
            const meta1 = masked.metadata[1]!;
            expect(meta0.otp).toBe("[REDACTED]");
            expect(meta0.note).toBe("verification otp");
            expect(meta1.authorization).toBe("[REDACTED]");
            expect(meta1.status).toBe("ok");
        });

        it("handles null, undefined, and non-object inputs safely", () => {
            expect(maskSensitiveData(null)).toBeNull();
            expect(maskSensitiveData(undefined)).toBeUndefined();
            expect(maskSensitiveData("simple-string")).toBe("simple-string");
            expect(maskSensitiveData(12345)).toBe(12345);
        });
    });

    describe("Client IP Resolution & Validation", () => {
        it("validates IPv4 and IPv6 addresses", () => {
            expect(isValidIp("127.0.0.1")).toBe(true);
            expect(isValidIp("192.168.1.1")).toBe(true);
            expect(isValidIp("::1")).toBe(true);
            expect(isValidIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
            expect(isValidIp("invalid-ip-string")).toBe(false);
            expect(isValidIp("999.999.999.999")).toBe(false);
            expect(isValidIp("")).toBe(false);
            expect(isValidIp(null)).toBe(false);
        });

        it("resolves Cloudflare cf-connecting-ip first", () => {
            const req = {
                headers: {
                    "cf-connecting-ip": "203.0.113.195",
                    "x-real-ip": "10.0.0.1",
                    "x-forwarded-for": "198.51.100.1, 10.0.0.1",
                },
                ip: "127.0.0.1",
            } as any;

            expect(getClientIp(req)).toBe("203.0.113.195");
        });

        it("falls back to x-real-ip and x-forwarded-for when Cloudflare header is absent", () => {
            const reqRealIp = {
                headers: {
                    "x-real-ip": "198.51.100.25",
                },
                ip: "127.0.0.1",
            } as any;
            expect(getClientIp(reqRealIp)).toBe("198.51.100.25");

            const reqForwarded = {
                headers: {
                    "x-forwarded-for": "198.51.100.99, 10.0.0.5",
                },
                ip: "127.0.0.1",
            } as any;
            expect(getClientIp(reqForwarded)).toBe("198.51.100.99");
        });
    });

    describe("Input Sanitization & Prototype Pollution Defense", () => {
        it("strips __proto__, constructor, and prototype keys", () => {
            const maliciousPayload = JSON.parse(
                '{"name":"Safe Name","__proto__":{"isAdmin":true},"constructor":{"prototype":{"hacked":true}},"nested":{"prototype":{"evil":true}}}',
            );

            const sanitized = sanitizeInput(maliciousPayload);

            expect(sanitized.name).toBe("Safe Name");
            expect(Object.prototype.hasOwnProperty.call(sanitized, "__proto__")).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(sanitized, "constructor")).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(sanitized.nested, "prototype")).toBe(false);
            expect((Object.prototype as any).isAdmin).toBeUndefined();
            expect((Object.prototype as any).hacked).toBeUndefined();
        });

        it("strips script tags and control characters from string values", () => {
            const dirty = '<script>alert("xss")</script>Hello <script src="evil.js"></script>World\0';
            const clean = sanitizeString(dirty);

            expect(clean).toBe("Hello World");
            expect(clean.includes("<script>")).toBe(false);
            expect(clean.includes("\0")).toBe(false);
        });
    });

    describe("CSRF Token Generator & Validator", () => {
        it("generates 64-character hexadecimal CSRF tokens", () => {
            const token1 = generateCsrfToken();
            const token2 = generateCsrfToken();

            expect(token1).toHaveLength(64);
            expect(token2).toHaveLength(64);
            expect(token1).not.toBe(token2);
        });

        it("allows safe GET/OPTIONS methods without CSRF check", () => {
            const reqGet = { method: "GET", headers: {}, cookies: {} } as any;
            expect(() => validateCsrfProtection(reqGet)).not.toThrow();

            const reqOptions = { method: "OPTIONS", headers: {}, cookies: {} } as any;
            expect(() => validateCsrfProtection(reqOptions)).not.toThrow();
        });

        it("allows Bearer token authenticated API requests to bypass cookie CSRF", () => {
            const reqBearer = {
                method: "POST",
                headers: { authorization: "Bearer valid-jwt-token" },
                cookies: {},
            } as any;

            expect(() => validateCsrfProtection(reqBearer)).not.toThrow();
        });

        it("validates matching double-submit cookie and header", () => {
            const token = generateCsrfToken();
            const validReq = {
                method: "POST",
                headers: { "x-csrf-token": token },
                cookies: { csrfToken: token },
                url: "/api/auth/refresh",
            } as any;

            expect(() => validateCsrfProtection(validReq)).not.toThrow();
        });

        it("throws 403 error on missing or mismatched CSRF tokens", () => {
            const missingReq = {
                method: "POST",
                headers: {},
                cookies: {},
                url: "/api/auth/refresh",
            } as any;

            expect(() => validateCsrfProtection(missingReq)).toThrow("Invalid or missing CSRF token");

            const mismatchReq = {
                method: "POST",
                headers: { "x-csrf-token": "wrong-token-value-1111111111111111111111111111111111111111111111111111" },
                cookies: { csrfToken: "correct-token-value-222222222222222222222222222222222222222222222222222" },
                url: "/api/auth/refresh",
            } as any;

            expect(() => validateCsrfProtection(mismatchReq)).toThrow("CSRF token validation failed");
        });
    });
});
