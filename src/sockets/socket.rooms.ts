/**
 * Room naming conventions and room authorization helpers.
 *
 * Rooms isolate broadcasts to only authorized connected sockets:
 * - user:{userId}       -> User's personal notification & order updates
 * - order:{orderId}     -> Updates for a specific order (customer tracking)
 * - admin               -> General administrative notifications
 * - admin:orders        -> Live admin orders stream
 * - admin:inventory     -> Real-time low stock / inventory alerts
 * - admin:payments      -> Real-time payment reconciliation stream
 */

export const SOCKET_ROOMS = {
    USER: (userId: string) => `user:${userId}`,
    ORDER: (orderId: string) => `order:${orderId}`,
    ADMIN: "admin",
    ADMIN_ORDERS: "admin:orders",
    ADMIN_INVENTORY: "admin:inventory",
    ADMIN_PAYMENTS: "admin:payments",
} as const;

export interface SocketUserContext {
    userId: string;
    email: string | null;
    roles: string[];
    permissions: string[];
}

/**
 * Checks if a user has sufficient administrative privileges to join admin rooms.
 */
export function canJoinAdminRoom(user: SocketUserContext, requiredPermission?: string): boolean {
    if (!user) return false;

    // SUPER_ADMIN and system:manage bypass all checks
    if (user.roles.includes("SUPER_ADMIN") || user.permissions.includes("system:manage")) {
        return true;
    }

    if (user.roles.includes("ADMIN")) {
        return true;
    }

    if (requiredPermission && user.permissions.includes(requiredPermission)) {
        return true;
    }

    return false;
}

/**
 * Validates whether a user can subscribe to a specific order room.
 * Admins can track any order; customers can only track orders they own.
 */
export function canJoinOrderRoom(user: SocketUserContext, orderOwnerId: string): boolean {
    if (!user) return false;
    if (canJoinAdminRoom(user, "order:read")) return true;
    return user.userId === orderOwnerId;
}
