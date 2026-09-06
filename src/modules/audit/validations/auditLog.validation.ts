import { z } from "zod";

export const auditLogQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    entityType: z.string().trim().optional(),
    entityId: z.string().trim().optional(),
    actorId: z.string().trim().optional(),
    action: z.string().trim().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const auditLogIdParamSchema = z.object({
    id: z.string().uuid("Invalid audit log ID format"),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
export type AuditLogIdParamInput = z.infer<typeof auditLogIdParamSchema>;
