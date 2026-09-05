import { describe, expect, it } from "vitest";
import { authRegister, loginSchema, otpVerification } from "../modules/auth/auth.validation.js";

// These tests stay independent of Fastify and infrastructure so validation failures are easy to diagnose.
describe("auth validation", () => {
    it("accepts a valid registration payload", () => {
        const result = authRegister.safeParse({
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.test",
            password: "Pass1234",
        });

        expect(result.success).toBe(true);
    });

    it("rejects invalid email and short passwords", () => {
        const result = loginSchema.safeParse({
            email: "not-an-email",
            password: "123",
        });

        expect(result.success).toBe(false);
    });

    it("requires a four-digit OTP", () => {
        // Keep both sides of the contract covered: valid OTPs pass and malformed OTPs fail.
        expect(otpVerification.safeParse({ email: "ada@example.test", otp: "1234" }).success).toBe(true);
        expect(otpVerification.safeParse({ email: "ada@example.test", otp: "12" }).success).toBe(false);
    });
});
