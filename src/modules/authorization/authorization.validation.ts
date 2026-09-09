import { z } from "zod";

export const roleBody = z.object({
    name: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
    description: z.string().trim().max(500).optional(),
});

export const updateRoleBody = roleBody.partial();
export const permissionAssignmentBody = z.object({
    permissionIds: z.array(z.string().trim().min(1)).max(100).optional(),
    permissions: z.array(z.string().trim().min(1)).max(100).optional(),
}).refine((data) => Boolean(data.permissionIds || data.permissions), {
    message: "Either permissionIds or permissions must be provided",
});

export const roleAssignmentBody = z.object({
    roleIds: z.array(z.string().trim().min(1)).max(50).optional(),
    roles: z.array(z.string().trim().min(1)).max(50).optional(),
}).refine((data) => Boolean(data.roleIds || data.roles), {
    message: "Either roleIds or roles must be provided",
});
