import { z } from "zod";

export const roleBody = z.object({
    name: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
    description: z.string().trim().max(500).optional(),
});

export const updateRoleBody = roleBody.partial();
export const permissionAssignmentBody = z.object({ permissionIds: z.array(z.string().uuid()).max(100) });
export const roleAssignmentBody = z.object({ roleIds: z.array(z.string().uuid()).max(50) });
