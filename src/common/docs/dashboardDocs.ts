/**
 * Swagger documentation schemas and tags for Admin Dashboard & Analytics endpoints.
 */
export const dashboardTags = [
    {
        name: "Admin Dashboard & Analytics",
        description: "📊 Executive KPI Overview (Revenue, Orders, Users, Inventory, Payments, Reviews), Sales & Revenue Time-Series Charts, Top Sellers, Low-Stock Alerts, and Failed Payment Telemetry",
    },
];

export const dashboardSwaggerSchemas = {
    periodQuery: {
        type: "object",
        properties: {
            period: {
                type: "string",
                enum: ["today", "7d", "30d", "90d", "1y", "all"],
                default: "30d",
                description: "Relative reporting time window",
            },
            startDate: { type: "string", format: "date-time", description: "Custom start timestamp" },
            endDate: { type: "string", format: "date-time", description: "Custom end timestamp" },
        },
    },

    salesTrendQuery: {
        type: "object",
        properties: {
            period: {
                type: "string",
                enum: ["7d", "30d", "90d", "1y"],
                default: "30d",
            },
            interval: {
                type: "string",
                enum: ["day", "week", "month"],
                default: "day",
                description: "Bucket granularity for charting",
            },
        },
    },

    lowStockQuery: {
        type: "object",
        properties: {
            threshold: { type: "integer", default: 10, minimum: 0, description: "Stock warning threshold" },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },

    topSellersQuery: {
        type: "object",
        properties: {
            limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
            period: {
                type: "string",
                enum: ["7d", "30d", "90d", "1y", "all"],
                default: "30d",
            },
        },
    },

    failedPaymentsQuery: {
        type: "object",
        properties: {
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },
};
