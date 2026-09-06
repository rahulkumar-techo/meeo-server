import type { FastifyRequest, FastifyReply } from "fastify";
import { auditLogService } from "../services/auditLog.service.js";
import { auditLogQuerySchema, auditLogIdParamSchema } from "../validations/auditLog.validation.js";
import { AppError } from "@/common/errors/app-error.js";

export class AuditLogController {
    /**
     * Lists paginated audit logs with search filters.
     */
    async listLogs(req: FastifyRequest, reply: FastifyReply) {
        const query = auditLogQuerySchema.parse(req.query);
        const result = await auditLogService.listLogs(query);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Retrieves a single audit log entry by ID.
     */
    async getLogById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = auditLogIdParamSchema.parse(req.params);
        const log = await auditLogService.getLogById(id);

        if (!log) {
            throw new AppError("Audit log record not found", 404);
        }

        return reply.status(200).send({
            success: true,
            status: "success",
            data: log,
        });
    }
}

export const auditLogController = new AuditLogController();
