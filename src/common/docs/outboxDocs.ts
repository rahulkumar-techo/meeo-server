/**
 * Swagger documentation schemas for Transactional Outbox & Event System endpoints.
 */
export const outboxSwaggerSchemas = {
    outboxQuery: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["PENDING", "PROCESSING", "PUBLISHED", "FAILED"],
                description: "Filter by outbox status",
            },
            eventType: {
                type: "string",
                description: "Filter by domain event type (e.g., ORDER_CONFIRMED, PAYMENT_SUCCESS)",
            },
            aggregateType: {
                type: "string",
                description: "Filter by aggregate type (e.g., Order, Payment, Inventory)",
            },
            aggregateId: {
                type: "string",
                description: "Filter by aggregate identifier",
            },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },

    publishBatch: {
        type: "object",
        properties: {
            batchSize: {
                type: "integer",
                default: 50,
                minimum: 1,
                maximum: 200,
                description: "Number of pending outbox events to claim and publish to BullMQ",
            },
        },
    },

    processedEventsQuery: {
        type: "object",
        properties: {
            status: {
                type: "string",
                enum: ["PROCESSING", "COMPLETED", "FAILED"],
                description: "Filter by consumer execution status",
            },
            consumerName: {
                type: "string",
                description: "Filter by consumer name (e.g., OrderEventsConsumer)",
            },
            eventId: {
                type: "string",
                description: "Filter by outbox event ID",
            },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },
};
