/**
 * Input sanitization and Prototype Pollution Defense
 */

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively removes prototype pollution attempts from objects and arrays.
 */
export function sanitizeInput<T>(input: T, depth = 0): T {
    if (depth > 15 || input === null || input === undefined) {
        return input;
    }

    if (Array.isArray(input)) {
        return input.map((item) => sanitizeInput(item, depth + 1)) as unknown as T;
    }

    if (typeof input === "object") {
        const sanitized: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            if (DANGEROUS_KEYS.has(key)) {
                continue; // Strip pollution key
            }

            if (typeof value === "string") {
                sanitized[key] = sanitizeString(value);
            } else if (typeof value === "object" && value !== null) {
                sanitized[key] = sanitizeInput(value, depth + 1);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized as T;
    }

    if (typeof input === "string") {
        return sanitizeString(input) as unknown as T;
    }

    return input;
}

/**
 * Strips script tags, javascript: pseudo-protocols, and null byte injection.
 */
export function sanitizeString(val: string): string {
    if (!val || typeof val !== "string") return val;

    return val
        .replace(/\0/g, "") // Remove null bytes
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
        .replace(/javascript:/gi, ""); // Remove javascript: pseudo-protocols
}
