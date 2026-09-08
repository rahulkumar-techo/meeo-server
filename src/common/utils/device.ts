import type { FastifyRequest } from "fastify";

/**
 * Highly accurate utility to filter real Native Mobile Apps (iOS/Android/Flutter/RN)
 * from standard web browsers running on desktop or phone devices.
 */
export function isMobileClient(request: FastifyRequest): boolean {
    const clientType = (request.headers["x-client-type"] as string | undefined)?.toLowerCase();
    if (clientType === "mobile" || clientType === "app" || clientType === "native") {
        return true;
    }

    const platform = (request.headers["x-platform"] as string | undefined)?.toLowerCase();
    if (platform === "mobile" || platform === "android" || platform === "ios") {
        return true;
    }

    const userAgent = (request.headers["user-agent"] as string | undefined)?.toLowerCase() || "";

    // Explicitly targeting native mobile app rendering core layers only
    if (
        userAgent.includes("react-native") ||
        userAgent.includes("expo") ||
        userAgent.includes("dart") ||
        userAgent.includes("flutter") ||
        userAgent.includes("okhttp") ||
        userAgent.includes("cfnetwork") ||
        userAgent.includes("alamofire")
    ) {
        return true;
    }

    return false;
}
