import { z } from "zod";

/**
 * Zod validations for Inventory Management: Stock operations, Reservations, and Checkout Simulation.
 */

export const addStockSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format"),
    quantity: z.number().int().positive("Added quantity must be at least 1"),
    note: z.string().trim().max(500).optional(),
    referenceType: z.string().trim().max(100).optional(),
    referenceId: z.string().trim().max(100).optional(),
});

export const removeStockSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format"),
    quantity: z.number().int().positive("Removed quantity must be at least 1"),
    note: z.string().trim().max(500).optional(),
    referenceType: z.string().trim().max(100).optional(),
    referenceId: z.string().trim().max(100).optional(),
});

export const adjustStockSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format"),
    availableQuantity: z.number().int().min(0, "Available quantity cannot be negative").optional(),
    reorderLevel: z.number().int().min(0, "Reorder level cannot be negative").nullable().optional(),
    note: z.string().trim().max(500).optional(),
});

export const reserveStockSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format"),
    quantity: z.number().int().positive("Reserved quantity must be at least 1"),
    orderId: z.string().uuid().nullable().optional(),
    expiresInMinutes: z.number().int().min(1).max(1440).default(15),
});

export const confirmReservationSchema = z.object({
    orderId: z.string().uuid().optional(),
});

export const releaseReservationSchema = z.object({
    reason: z.string().trim().max(500).optional(),
});

export const inventoryQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    lowStockOnly: z
        .preprocess((val) => (val === "true" || val === true ? true : false), z.boolean())
        .optional(),
});

export const transactionQuerySchema = z.object({
    variantId: z.string().uuid().optional(),
    type: z.enum([
        "STOCK_ADDED",
        "STOCK_REMOVED",
        "ORDER_RESERVED",
        "ORDER_CONFIRMED",
        "ORDER_CANCELLED",
        "RETURNED",
        "MANUAL_ADJUSTMENT",
    ]).optional(),
    referenceType: z.string().trim().optional(),
    referenceId: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const simulateCheckoutSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format"),
    quantity: z.number().int().positive("Checkout quantity must be at least 1"),
    simulatePaymentSuccess: z.boolean().default(true),
    holdMinutes: z.number().int().min(1).max(1440).default(15),
});

export type AddStockInput = z.infer<typeof addStockSchema>;
export type RemoveStockInput = z.infer<typeof removeStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ReserveStockInput = z.infer<typeof reserveStockSchema>;
export type ConfirmReservationInput = z.infer<typeof confirmReservationSchema>;
export type ReleaseReservationInput = z.infer<typeof releaseReservationSchema>;
export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
export type SimulateCheckoutInput = z.infer<typeof simulateCheckoutSchema>;
