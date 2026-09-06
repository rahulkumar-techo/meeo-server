export const auditTags = [
    {
        name: "Security & Audit Logs",
        description: "🛡️ Production-Grade Security Hardening, Audit Trails, Sensitive Masking, and Security Health",
    },
];

export const auditSwaggerSchemas = {
    listAuditLogsQuery: {
        type: "object",
        properties: {
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
            entityType: { type: "string", description: "Filter by target entity type (e.g. Order, User, Product, Role)" },
            entityId: { type: "string", description: "Filter by specific entity ID" },
            actorId: { type: "string", description: "Filter by admin / user actor UUID" },
            action: { type: "string", description: "Filter by action name (e.g. USER_LOGIN, ROLE_GRANTED, ORDER_CANCELLED)" },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time" },
        },
    },
    auditLogIdParam: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string", format: "uuid" },
        },
    },
};
