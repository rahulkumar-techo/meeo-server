import { z } from "zod";

export const authRegister = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().trim().min(5, "Password must be at least 5 characters").max(12, "Password cannot exceed 12 characters"),
});

export const otpVerification = z.object({
    otp: z.coerce.string().regex(/^\d{4}$/, "OTP must be exactly 4 digits"),
    email: z.string().email("Invalid email address"),
});

export const resendOtp = z.object({
    email: z.string().email("Invalid email address"),
});

export const forgotPassword = resendOtp;

export const resetPassword = otpVerification.extend({
    password: z.string().trim().min(5, "Password must be at least 5 characters").max(12, "Password cannot exceed 12 characters"),
});

export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().trim().min(5, "Password must be at least 5 characters").max(12, "Password cannot exceed 12 characters"),
    deviceName: z.string().trim().max(100).optional(),
    deviceId: z.string().trim().max(255).optional(),
});


export type AuthRegisterInput = z.infer<typeof authRegister>;
export type AuthOtpVerification = z.infer<typeof otpVerification>;
export type AuthLoginOption = z.infer<typeof loginSchema>;
export type ResendOtpInput = z.infer<typeof resendOtp>;
export type ForgotPasswordInput = z.infer<typeof forgotPassword>;
export type ResetPasswordInput = z.infer<typeof resetPassword>;