import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";

/**
 * Validates whether the authenticated user is authorized to modify or delete a catalog resource.
 * 
 * Authorization Policy:
 * 1. The resource creator (`createdById === user.id`) is always permitted.
 * 2. A user with `system:manage` (SUPER_ADMIN) is always permitted.
 * 3. A user possessing the required permission (or fallback permission) is permitted.
 *
 * @param createdById - The user ID of the creator stored on the resource.
 * @param user - The authenticated user's authorization context.
 * @param requiredPermissions - One or more permissions that grant authority (e.g. `product:delete`, `product:update`).
 */
export function verifyCatalogOwnershipOrPermission(
    createdById: string | null | undefined,
    user: AuthorizationContext | undefined,
    requiredPermissions: string | string[],
): void {
    if (!user) {
        throw new AppError("Authentication required", 401);
    }

    // Super admin bypass
    if (user.permissions.includes(PERMISSIONS.SYSTEM_MANAGE)) {
        return;
    }

    // Resource creator ownership check
    if (createdById && user.id === createdById) {
        return;
    }

    // RBAC permission check
    const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const hasPermission = perms.some((p) => user.permissions.includes(p));

    if (!hasPermission) {
        throw new AppError("You do not have permission to modify or delete this resource", 403);
    }
}
