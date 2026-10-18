// Zod validation schemas for observability queries.

import { z } from "zod";

export const metricsRangeQuerySchema = z.object({
    query: z.string().trim().optional(),
    preset: z.string().trim().optional(),
    start: z.string().trim().optional(),
    end: z.string().trim().optional(),
    step: z.string().trim().regex(/^(\d+[smhd])?$/, "Invalid step format, use e.g. 15s, 1m, 5m").optional(),
}).refine((data) => Boolean(data.query || data.preset), {
    message: "Either 'query' (PromQL) or 'preset' must be specified",
    path: ["query"],
});

export const metricsInstantQuerySchema = z.object({
    query: z.string().trim().optional(),
    preset: z.string().trim().optional(),
    time: z.string().trim().optional(),
}).refine((data) => Boolean(data.query || data.preset), {
    message: "Either 'query' (PromQL) or 'preset' must be specified",
    path: ["query"],
});

export const logsQuerySchema = z.object({
    query: z.string().trim().default('{job="docker"}'),
    start: z.string().trim().optional(),
    end: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    direction: z.enum(["backward", "forward"]).default("backward"),
    level: z.enum(["error", "warn", "info", "debug", "trace"]).optional(),
});

export const logsStreamQuerySchema = z.object({
    query: z.string().trim().default('{job="docker"}'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const labelParamSchema = z.object({
    name: z.string().trim().min(1, "Label name is required"),
});

export const updateObservabilityConfigSchema = z.object({
    isEnabled: z.boolean().optional(),
    description: z.string().trim().optional(),
    value: z.record(z.string(), z.unknown()).optional(),
});

export const configKeyParamSchema = z.object({
    key: z.string().trim().min(1, "Config key is required"),
});

export type MetricsRangeQueryInput = z.infer<typeof metricsRangeQuerySchema>;
export type MetricsInstantQueryInput = z.infer<typeof metricsInstantQuerySchema>;
export type LogsQueryInput = z.infer<typeof logsQuerySchema>;
export type LogsStreamQueryInput = z.infer<typeof logsStreamQuerySchema>;
export type LabelParamInput = z.infer<typeof labelParamSchema>;
export type UpdateObservabilityConfigInput = z.infer<typeof updateObservabilityConfigSchema>;
export type ConfigKeyParamInput = z.infer<typeof configKeyParamSchema>;

