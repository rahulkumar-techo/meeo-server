import { AppError } from "@/common/errors/app-error.js";
import { prisma } from "@/lib/prisma.js";
import { Prisma } from "@/generated/prisma/client.js";

export type AuditContext = {
    actorId: string;
    entityId?: string | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    requestId?: string;
};

type AuditInput = AuditContext & {
    action: string;
    entityType: string;
    oldValue?: unknown;
    newValue?: unknown;
};

/** Converts authorization audit input into the Prisma AuditLog shape. */
const auditData = (input: AuditInput) => {
    // Keep request IDs in the JSON snapshot until AuditLog gets a dedicated requestId column.
    const newValue = input.requestId
        ? { ...(input.newValue as Record<string, unknown> ?? {}), requestId: input.requestId }
        : input.newValue;

    return {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldValue: (input.oldValue ?? null) as Prisma.InputJsonValue | null,
        newValue: (newValue ?? null) as Prisma.InputJsonValue | null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
    };
};

export const roleWithPermissions = {
    permissions: { select: { permission: true } },
} as const;

class AuthorizationService {
    /** Lists roles in stable name order with their assigned permissions. */
    async listRoles() {
        return prisma.role.findMany({
            orderBy: { name: "asc" },
            include: roleWithPermissions,
        });
    }

    /** Loads one role or raises a not-found application error. */
    async getRole(roleId: string) {
        const role = await prisma.role.findUnique({ where: { id: roleId }, include: roleWithPermissions });
        if (!role) throw new AppError("Role not found", 404);
        return role;
    }

    /** Creates a role and its audit record atomically. */
    async createRole(input: { name: string; description?: string | undefined }, audit: AuditContext) {
        return prisma.$transaction(async (tx) => {
            const role = await tx.role.create({
                data: input.description === undefined ? { name: input.name } : { name: input.name, description: input.description },
                include: roleWithPermissions,
            });
            await tx.auditLog.create({ data: auditData({ ...audit, action: "ROLE_CREATED", entityType: "Role", entityId: role.id, newValue: { name: role.name, description: role.description } }) as never });
            return role;
        });
    }

    /** Updates a role and records the before/after values in the same transaction. */
    async updateRole(roleId: string, input: { name?: string | undefined; description?: string | undefined }, audit: AuditContext) {
        return prisma.$transaction(async (tx) => {
            const current = await tx.role.findUnique({ where: { id: roleId } });
            if (!current) throw new AppError("Role not found", 404);
            const data = {
                ...(input.name === undefined ? {} : { name: input.name }),
                ...(input.description === undefined ? {} : { description: input.description }),
            };
            const role = await tx.role.update({ where: { id: roleId }, data, include: roleWithPermissions });
            await tx.auditLog.create({ data: auditData({ ...audit, action: "ROLE_UPDATED", entityType: "Role", entityId: role.id, oldValue: { name: current.name, description: current.description }, newValue: { name: role.name, description: role.description } }) as never });
            return role;
        });
    }

    /** Deletes a non-protected role and records the deleted role in the audit log. */
    async deleteRole(roleId: string, audit: AuditContext) {
        return prisma.$transaction(async (tx) => {
            const role = await tx.role.findUnique({ where: { id: roleId } });
            if (!role) throw new AppError("Role not found", 404);
            if (role.name === "SUPER_ADMIN") throw new AppError("The SUPER_ADMIN role is protected", 409);
            await tx.role.delete({ where: { id: roleId } });
            await tx.auditLog.create({ data: auditData({ ...audit, action: "ROLE_DELETED", entityType: "Role", entityId: roleId, oldValue: { name: role.name, description: role.description } }) as never });
            return { deleted: true };
        });
    }

    /** Lists all developer-defined permissions available to administrators. */
    async listPermissions() {
        return prisma.permission.findMany({ orderBy: { name: "asc" } });
    }

    /** Validates and replaces a role's permissions atomically, then audits the change. */
    async replaceRolePermissions(roleId: string, permissionIds: string[], audit: AuditContext) {
        return prisma.$transaction(async (tx) => {
            const role = await tx.role.findUnique({ where: { id: roleId }, include: roleWithPermissions });
            if (!role) throw new AppError("Role not found", 404);
            const uniquePermissionIds = [...new Set(permissionIds)];
            const permissions = await tx.permission.findMany({ where: { id: { in: uniquePermissionIds } }, select: { id: true, name: true } });
            if (permissions.length !== uniquePermissionIds.length) throw new AppError("One or more permissions were not found", 404);
            await tx.rolePermission.deleteMany({ where: { roleId } });
            if (uniquePermissionIds.length > 0) await tx.rolePermission.createMany({ data: uniquePermissionIds.map((permissionId) => ({ roleId, permissionId })) });
            await tx.auditLog.create({ data: auditData({ ...audit, action: "PERMISSIONS_ASSIGNED_TO_ROLE", entityType: "Role", entityId: roleId, oldValue: role.permissions.map(({ permission }) => permission.name), newValue: permissions.map(({ name }) => name) }) as never });
            return tx.role.findUnique({ where: { id: roleId }, include: roleWithPermissions });
        });
    }

    /** Validates and replaces a user's roles atomically, then audits the change. */
    async replaceUserRoles(userId: string, roleIds: string[], audit: AuditContext) {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
            if (!user) throw new AppError("User not found", 404);
            const uniqueRoleIds = [...new Set(roleIds)];
            const roles = await tx.role.findMany({ where: { id: { in: uniqueRoleIds } }, select: { id: true, name: true } });
            if (roles.length !== uniqueRoleIds.length) throw new AppError("One or more roles were not found", 404);
            await tx.userRole.deleteMany({ where: { userId } });
            if (uniqueRoleIds.length > 0) await tx.userRole.createMany({ data: uniqueRoleIds.map((roleId) => ({ userId, roleId })) });
            await tx.auditLog.create({ data: auditData({ ...audit, action: "ROLES_ASSIGNED_TO_USER", entityType: "User", entityId: userId, oldValue: user.roles.map(({ role }) => role.name), newValue: roles.map(({ name }) => name) }) as never });
            return roles;
        });
    }
}

export const authorizationService = new AuthorizationService();
