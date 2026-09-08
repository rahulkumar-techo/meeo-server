import { z } from "zod";

export const SystemSettingsSchema = z.object({
    // Tier 1 — Core Platform & Brand
    platformBrandName: z.string().min(1).max(100).default("E-Commerce Platform"),
    publicDomainUrl: z.string().url().default("https://store.example.com"),
    supportEmail: z.string().email().default("support@example.com"),
    operationsEmail: z.string().email().default("ops@example.com"),
    securityEmail: z.string().email().default("security@example.com"),
    requireAdmin2FA: z.boolean().default(false),
    defaultCurrency: z.string().min(3).max(3).default("USD"),
    timezone: z.string().min(1).default("UTC"),

    // Operational Controls & System Modes
    maintenanceMode: z.boolean().default(false),
    readOnlyMode: z.boolean().default(false),
    disableCheckout: z.boolean().default(false),
    disablePayments: z.boolean().default(false),

    // Rate Limiting
    globalApiRateLimit: z.coerce.number().int().min(10).max(10000).default(100),
    loginRateLimit: z.coerce.number().int().min(1).max(100).default(5),
    checkoutRateLimit: z.coerce.number().int().min(1).max(200).default(10),

    // Feature Flags & Rollouts
    featureFlags: z.record(z.string(), z.boolean()).default({
        enableReviews: true,
        enableCoupons: true,
        enableWishlists: true,
        enableGuestCheckout: true,
        enableExpressPay: true,
        enableAiSearch: false,
    }),
    percentageFeatureRollout: z.record(z.string(), z.number().min(0).max(100)).default({
        newCheckoutFunnel: 100,
        aiProductRecommendations: 20,
    }),

    // Tier 2 — Financial Rules
    settlementFrequency: z.enum(["DAILY", "WEEKLY", "BI_WEEKLY", "MONTHLY"]).default("WEEKLY"),
    settlementDelayDays: z.coerce.number().int().min(0).max(30).default(2),
    minimumPayoutAmount: z.coerce.number().min(0).default(50.00),
    reservePercentage: z.coerce.number().min(0).max(100).default(5.0),
    refundApprovalThreshold: z.coerce.number().min(0).default(500.00),
    automatedPayouts: z.boolean().default(true),

    // Tier 3 — Advanced & Emergency Controls
    allowedMaintenanceIps: z.array(z.string()).default([]),
    emergencyControls: z.object({
        killSwitchActive: z.boolean().default(false),
        emergencyMessage: z.string().nullable().default(null),
        frozenAt: z.string().nullable().default(null),
    }).default({
        killSwitchActive: false,
        emergencyMessage: null,
        frozenAt: null,
    }),
    dataRetentionDays: z.coerce.number().int().min(30).max(3650).default(365),
});

export const UpdateSystemSettingsSchema = SystemSettingsSchema.partial();

export const EmergencyKillSwitchSchema = z.object({
    killSwitchActive: z.boolean(),
    emergencyMessage: z.string().min(5).max(500).optional(),
});

export type SystemSettings = z.infer<typeof SystemSettingsSchema>;
export type UpdateSystemSettingsInput = z.infer<typeof UpdateSystemSettingsSchema>;
export type EmergencyKillSwitchInput = z.infer<typeof EmergencyKillSwitchSchema>;
