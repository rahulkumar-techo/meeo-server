import type { FastifyRequest } from "fastify";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "./permission.constants.js";

type PermissionRequest = FastifyRequest & {
    user?: { permissions: string[] };
};

const checkPermissions = (permissions: string[], mode: "any" | "all") => async (request: PermissionRequest) => {
    if (!request.user) throw new AppError("Authentication required", 401);
    const granted = new Set(request.user.permissions);
    if (granted.has(PERMISSIONS.SYSTEM_MANAGE)) return;

    const allowed = mode === "any"
        ? permissions.some((permission) => granted.has(permission))
        : permissions.every((permission) => granted.has(permission));
    if (!allowed) throw new AppError("Forbidden", 403);
};

export const requirePermission = (permission: string) => checkPermissions([permission], "all");
export const requireAnyPermission = (permissions: string[]) => checkPermissions(permissions, "any");
export const requireAllPermissions = (permissions: string[]) => checkPermissions(permissions, "all");
