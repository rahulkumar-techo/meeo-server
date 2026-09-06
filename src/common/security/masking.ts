/**
 * Sensitive Data Masking Utility
 * Redacts secrets, tokens, passwords, payment info, and PII from log outputs and telemetry.
 */

const SENSITIVE_KEYS = new Set([
    "password",
    "passwordhash",
    "confirmpassword",
    "currentpassword",
    "newpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "cookie",
    "set-cookie",
    "secret",
    "jwt_access_secret",
    "jwt_refresh_secret",
    "otp",
    "cvv",
    "cvc",
    "cardnumber",
    "card_number",
    "creditcard",
    "apikey",
    "api_key",
    "stripesecret",
    "stripe_secret_key",
    "razorpaykeysecret",
    "razorpay_key_secret",
    "signature",
    "razorpay_signature",
    "stripe-signature",
]);

/**
 * Recursively masks sensitive keys within an object, array, or primitive.
 */
export function maskSensitiveData<T>(data: T, depth = 0): T {
    if (depth > 10 || data === null || data === undefined) {
        return data;
    }

    if (typeof data !== "object") {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map((item) => maskSensitiveData(item, depth + 1)) as unknown as T;
    }

    const maskedObj: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase().replace(/[-_]/g, "");

        if (SENSITIVE_KEYS.has(lowerKey)) {
            maskedObj[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
            maskedObj[key] = maskSensitiveData(value, depth + 1);
        } else {
            maskedObj[key] = value;
        }
    }

    return maskedObj as T;
}

/**
 * Pino log serializers with automatic sensitive field redaction.
 */
export const secureLogSerializers = {
    req(req: any) {
        return {
            method: req.method,
            url: req.url,
            path: req.routerPath || req.url?.split("?")[0],
            parameters: maskSensitiveData(req.params),
            headers: maskSensitiveData(req.headers),
            remoteAddress: req.ip || req.socket?.remoteAddress,
            remotePort: req.socket?.remotePort,
        };
    },
    res(res: any) {
        return {
            statusCode: res.statusCode,
        };
    },
    err(err: any) {
        if (!err) return err;
        return {
            type: err.name || err.constructor?.name,
            message: err.message,
            stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
            code: err.code,
            statusCode: err.statusCode,
        };
    },
};
