// Shared OpenAPI fragments keep auth and user route definitions consistent.
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

export const authSchemas = {
    registerBody: {
        type: "object",
        required: ["firstName", "lastName", "email", "password"],
        properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password", minLength: 5, maxLength: 12 },
        },
    },
    emailOtpBody: {
        type: "object",
        required: ["email", "otp"],
        properties: {
            email: { type: "string", format: "email" },
            otp: { type: "string", pattern: "^[0-9]{4}$" },
        },
    },
    emailBody: {
        type: "object",
        required: ["email"],
        properties: {
            email: { type: "string", format: "email" },
        },
    },
    resetPasswordBody: {
        type: "object",
        required: ["email", "otp", "password"],
        properties: {
            email: { type: "string", format: "email" },
            otp: { type: "string", pattern: "^[0-9]{4}$" },
            password: { type: "string", format: "password", minLength: 5, maxLength: 12 },
        },
    },
    loginBody: {
        type: "object",
        required: ["email", "password"],
        properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" },
        },
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
