// Shared OpenAPI fragments keep response, address, and user schemas consistent.
// Feature-specific route metadata belongs in authentication.ts or authorization.ts.
export const userSchema = {
    type: "object",
    properties: {
        id: { type: "string" },
        email: { type: "string", format: "email" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        phone: { type: ["string", "null"] },
        isVerified: { type: "boolean" },
    },
};

export const addressSchema = {
    type: "object",
    required: ["recipientName", "addressLine1", "city", "state", "postalCode", "country"],
    properties: {
        recipientName: { type: "string" },
        addressLine1: { type: "string" },
        addressLine2: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        postalCode: { type: "string" },
        country: { type: "string" },
    },
};

export const successResponse = (data?: object) => ({
    type: "object",
    properties: {
        success: { type: "boolean", example: true },
        message: { type: "string" },
        ...(data ? { data } : {}),
    },
});

export const errorResponse = {
    type: "object",
    required: ["success", "message"],
    properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        errors: { type: "object", additionalProperties: true },
    },
};

// Development/test flows return the generated OTP until an email/SMS provider is connected.
export const tempOtpResponse = {
    type: "object",
    properties: {
        tempOtp: { type: "string", pattern: "^[0-9]{4}$", description: "Temporary verification OTP" },
    },
};

export const tokenResponse = {
    type: "object",
    properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
    },
};

export const userSchemas = {
    profileBody: {
        type: "object",
        required: ["firstName", "lastName"],
        properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
        },
    },
    phoneOtpBody: {
        type: "object",
        required: ["phone"],
        properties: {
            phone: { type: "string" },
        },
    },
    phoneVerificationBody: {
        type: "object",
        required: ["phone", "otp"],
        properties: {
            phone: { type: "string" },
            otp: { type: "string", pattern: "^[0-9]{4}$" },
        },
    },
};
