import { z } from "zod";

const emailField = z.string().trim().toLowerCase().email("Invalid email address");

export const authRegister = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: emailField,
    password: z.string().trim().min(5, "Password must be at least 5 characters").max(100, "Password cannot exceed 100 characters"),
});

export const otpVerification = z.object({
    otp: z.coerce.string().regex(/^\d{4}$/, "OTP must be exactly 4 digits"),
    email: emailField,
});

export const resendOtp = z.object({
    email: emailField,
});

export const forgotPassword = resendOtp;

export const resetPassword = otpVerification.extend({
    password: z.string().trim().min(5, "Password must be at least 5 characters").max(100, "Password cannot exceed 100 characters"),
});

export const loginSchema = z.object({
    email: emailField,
    password: z.string().trim().min(5, "Password must be at least 5 characters").max(100, "Password cannot exceed 100 characters"),
    deviceName: z.string().trim().max(100).optional(),
    deviceId: z.string().trim().max(255).optional(),
});

export const googleLoginSchema = z.object({
    idToken: z.string().min(1, "Google ID token is required"),
    deviceName: z.string().trim().max(100).optional(),
    deviceId: z.string().trim().max(255).optional(),
});

export const setPasswordSchema = z.object({
    password: z.string().trim().min(8, "Password must be at least 8 characters").max(100, "Password cannot exceed 100 characters"),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().trim().min(8, "Password must be at least 8 characters").max(100, "Password cannot exceed 100 characters"),
});

export const linkGoogleSchema = z.object({
    idToken: z.string().min(1, "Google ID token is required"),
});

export const unlinkProviderParams = z.object({
    provider: z.string().toUpperCase().pipe(z.enum(["PASSWORD", "GOOGLE"])),
});

export type AuthRegisterInput = z.infer<typeof authRegister>;
export type AuthOtpVerification = z.infer<typeof otpVerification>;
export type AuthLoginOption = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type ResendOtpInput = z.infer<typeof resendOtp>;
export type ForgotPasswordInput = z.infer<typeof forgotPassword>;
export type ResetPasswordInput = z.infer<typeof resetPassword>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LinkGoogleInput = z.infer<typeof linkGoogleSchema>;
export type UnlinkProviderParams = z.infer<typeof unlinkProviderParams>;