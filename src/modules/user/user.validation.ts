import z from "zod";


export const profileSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
});

export const phoneOtpRequestSchema = z.object({
    phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number"),
});

export const phoneVerificationSchema = phoneOtpRequestSchema.extend({
    otp: z.coerce.string().regex(/^\d{4}$/, "OTP must be exactly 4 digits"),
});

export const addressSchema = z.object({
    recipientName:z.string(),
    addressLine1: z
        .string()
        .trim()
        .min(1, { message: "Address Line 1 is required" })
        .max(100, { message: "Address is too long" })
        .transform((val) => val.replace(/</g, "&lt;").replace(/>/g, "&gt;")), // Basic XSS mitigation

    addressLine2: z
        .string()
        .trim()
        .max(100, { message: "Address Line 2 is too long" })
        .transform((val) => val?.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
        .optional(),

    city: z
        .string()
        .trim()
        .min(1, { message: "City is required" })
        .max(50, { message: "City name is too long" })
        .regex(/^[a-zA-Z\s.-]+$/, { message: "Invalid characters in city name" }), // Blocks scripts/SQL payloads

    state: z
        .string()
        .trim()
        .min(1, { message: "State/Region is required" })
        .max(50, { message: "State name is too long" })
        .regex(/^[a-zA-Z\s.-]+$/, { message: "Invalid characters in state name" }),

    postalCode: z
        .string()
        .trim()
        .min(1, { message: "Postal code is required" })
        .max(12, { message: "Postal code is too long" })
        .regex(/^[a-zA-Z0-9\s-]+$/, { message: "Invalid postal code format" }), // Allows standard alphanumeric postal/ZIP codes

    country: z
        .string()
        .trim()
        .min(2, { message: "Country is required" })
        .max(56, { message: "Country name is too long" }) // 56 characters covers the longest official short-form country name
        .regex(/^[a-zA-Z\s.-]+$/, { message: "Invalid characters in country name" }),
}).strict(); // Rejects any extra, unmapped fields injected into the request body


export type UserProfilePayload = z.infer<typeof profileSchema>;
export type UserAddressPayload = z.infer<typeof addressSchema>;
export type PhoneOtpRequestPayload = z.infer<typeof phoneOtpRequestSchema>;
export type PhoneVerificationPayload = z.infer<typeof phoneVerificationSchema>;