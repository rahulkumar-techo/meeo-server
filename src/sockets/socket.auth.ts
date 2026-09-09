import type { Socket } from "socket.io";
import { verifyAccessToken } from "@/common/utils/token.js";
import { getAuthContext, setAuthContext } from "@/common/utils/auth-cache.js";
import { prisma } from "@/lib/prisma.js";
import type { SocketUserContext } from "./socket.rooms.js";

declare module "socket.io" {
    interface SocketData {
        user?: SocketUserContext;
    }
}

/**
 * Extracts the JWT access token from socket handshake auth, headers, or cookies.
 */
function extractToken(socket: Socket): string | null {
    // 1. Auth payload from Socket.io client: io({ auth: { token: "..." } })
    if (socket.handshake.auth?.token && typeof socket.handshake.auth.token === "string") {
        return socket.handshake.auth.token.replace(/^Bearer\s+/i, "").trim();
    }

    // 2. Authorization header: "Bearer <token>"
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && typeof authHeader === "string") {
        const [scheme, token] = authHeader.split(" ");
        if (scheme === "Bearer" && token) {
            return token.trim();
        }
    }

    // 3. Cookie fallback: accessToken=...
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]+)/);
        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }
    }

    return null;
}

/**
 * Socket.io Handshake Authentication Middleware.
 * Rejects unauthenticated connections and sets socket.data.user.
 */
export async function socketAuthMiddleware(
    socket: Socket,
    next: (err?: Error) => void,
): Promise<void> {
    const token = extractToken(socket);

    if (!token) {
        return next(new Error("Authentication required: Missing access token"));
    }

    try {
        const payload = verifyAccessToken(token);

        // Check Redis Auth Context cache first
        let cached = await getAuthContext(payload.userId, payload.sessionId);
        let roles = cached?.roles;
        let permissions = cached?.permissions;

        if (!cached || !roles || !permissions) {
            // Load user with roles and permissions from database
            const user = await prisma.user.findUnique({
                where: { id: payload.userId },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    roles: {
                        select: {
                            role: {
                                select: {
                                    name: true,
                                    permissions: {
                                        select: { permission: { select: { name: true } } },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!user || user.status !== "ACTIVE") {
                return next(new Error("Authentication failed: User is inactive or not found"));
            }

            roles = user.roles.map(({ role }) => role.name);
            permissions = [...new Set(user.roles.flatMap(({ role }) =>
                role.permissions.map(({ permission }) => permission.name),
            ))];

            await setAuthContext({
                userId: user.id,
                email: user.email,
                roles,
                permissions,
                ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
            });
        }

        socket.data.user = {
            userId: payload.userId,
            email: payload.email,
            roles,
            permissions,
        };

        next();
    } catch {
        return next(new Error("Authentication failed: Invalid or expired token"));
    }
}
