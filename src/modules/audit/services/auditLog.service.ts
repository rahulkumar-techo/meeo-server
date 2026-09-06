import { prisma } from "@/lib/prisma.js";
import { maskSensitiveData } from "@/common/security/masking.js";
import type { AuditLogQueryInput } from "../validations/auditLog.validation.js";

export interface CreateAuditLogParams {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export class AuditLogService {
    /**
     * Records a secure audit log entry with automatic sensitive data redaction.
     */
    async recordLog(params: CreateAuditLogParams) {
        try {
            const sanitizedOldValue = params.oldValue !== undefined ? maskSensitiveData(params.oldValue) : undefined;
            const sanitizedNewValue = params.newValue !== undefined ? maskSensitiveData(params.newValue) : undefined;

            return await prisma.auditLog.create({
                data: {
                    action: params.action,
                    entityType: params.entityType,
                    ...(params.actorId ? { actorId: params.actorId } : {}),
                    ...(params.entityId ? { entityId: params.entityId } : {}),
                    ...(sanitizedOldValue !== undefined ? { oldValue: sanitizedOldValue } : {}),
                    ...(sanitizedNewValue !== undefined ? { newValue: sanitizedNewValue } : {}),
                    ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
                    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
                },
            });
        } catch (error) {
            // Non-blocking: audit log failure should never abort primary business transactions
            console.error("[AuditLogService] Failed to record audit log:", error);
            return null;
        }
    }

    /**
     * Retrieves a paginated list of audit logs with multi-attribute filtering.
     */
    async listLogs(query: AuditLogQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (query.entityType) where.entityType = { equals: query.entityType, mode: "insensitive" };
        if (query.entityId) where.entityId = query.entityId;
        if (query.actorId) where.actorId = query.actorId;
        if (query.action) where.action = { contains: query.action, mode: "insensitive" };

        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) where.createdAt.gte = new Date(query.startDate);
            if (query.endDate) where.createdAt.lte = new Date(query.endDate);
        }

        const [items, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    actor: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            items: items.map((log) => ({
                id: log.id,
                action: log.action,
                entityType: log.entityType,
                entityId: log.entityId,
                oldValue: log.oldValue,
                newValue: log.newValue,
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                createdAt: log.createdAt,
                actor: log.actor
                    ? {
                          id: log.actor.id,
                          email: log.actor.email,
                          name: `${log.actor.firstName ?? ""} ${log.actor.lastName ?? ""}`.trim(),
                      }
                    : null,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Retrieves a single audit log entry by ID.
     */
    async getLogById(id: string) {
        const log = await prisma.auditLog.findUnique({
            where: { id },
            include: {
                actor: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        if (!log) return null;

        return {
            id: log.id,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            oldValue: log.oldValue,
            newValue: log.newValue,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            createdAt: log.createdAt,
            actor: log.actor
                ? {
                      id: log.actor.id,
                      email: log.actor.email,
                      name: `${log.actor.firstName ?? ""} ${log.actor.lastName ?? ""}`.trim(),
                  }
                : null,
        };
    }
}

export const auditLogService = new AuditLogService();
