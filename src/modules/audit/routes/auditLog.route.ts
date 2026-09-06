import type { FastifyInstance } from "fastify";
import { auditLogController } from "../controller/auditLog.controller.js";
import { auditSwaggerSchemas } from "@/common/docs/auditDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Audit Log routes under /api/v1/admin/audit-logs.
 */
export async function auditLogRouter(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);

    app.get(
        "/",
        {
            preHandler: [app.requirePermission(PERMISSIONS.AUDIT_LOG_READ)],
            schema: {
                tags: ["Security & Audit Logs"],
                summary: "[Admin: audit:read] Query system audit logs",
                description: "Retrieves a paginated, searchable timeline of system actions with actor details, entity changes, IP addresses, and user agents.",
                security: [{ bearerAuth: [] }],
                querystring: auditSwaggerSchemas.listAuditLogsQuery,
            },
        },
        auditLogController.listLogs.bind(auditLogController),
    );

    app.get(
        "/:id",
        {
            preHandler: [app.requirePermission(PERMISSIONS.AUDIT_LOG_READ)],
            schema: {
                tags: ["Security & Audit Logs"],
                summary: "[Admin: audit:read] Get audit log record details",
                description: "Retrieves complete before/after state diffs and context for a specific audit log record.",
                security: [{ bearerAuth: [] }],
                params: auditSwaggerSchemas.auditLogIdParam,
            },
        },
        auditLogController.getLogById.bind(auditLogController),
    );
}

export default auditLogRouter;
