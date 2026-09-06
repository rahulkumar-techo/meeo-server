import type { FastifyInstance } from "fastify";
import { userController } from "./controller/user.controller.js";
import { addressSchema, errorResponse, successResponse, userSchemas } from "@/common/docs/swagger.js";

const authenticated = (summary: string, description: string, body?: object) => ({
    tags: ["User"],
    summary,
    description,
    security: [{ bearerAuth: [] }],
    ...(body ? { body } : {}),
});
const commonErrors = { 400: errorResponse, 401: errorResponse, 404: errorResponse, 422: errorResponse };

const userRouter = (app: FastifyInstance) => {
    // Authenticate once for the whole router so every profile, address, and phone operation
    // receives a verified request.user before its controller runs.
    app.addHook("preHandler", app.authenticate);

    // Profile management
    app.patch(
        "/profile",
        {
            schema: {
                ...authenticated(
                    "[Authenticated User] Update profile",
                    "Update first name, last name, or personal profile details of the authenticated user.",
                    userSchemas.profileBody,
                ),
                response: { 200: successResponse(), ...commonErrors },
            },
        },
        userController.updateProfile.bind(userController),
    );

    // Address management
    app.post(
        "/addresses",
        {
            schema: {
                ...authenticated(
                    "[Authenticated User] Create address",
                    "Add a new shipping or billing address to the authenticated user's address book.",
                    addressSchema,
                ),
                response: { 201: successResponse(), ...commonErrors },
            },
        },
        userController.createAddress.bind(userController),
    );

    app.patch<{ Params: { addressId: string } }>(
        "/addresses/:addressId",
        {
            schema: {
                ...authenticated(
                    "[Authenticated User] Update address",
                    "Update details of an existing address owned by the authenticated user.",
                    addressSchema,
                ),
                params: { type: "object", required: ["addressId"], properties: { addressId: { type: "string" } } },
                response: { 200: successResponse(), ...commonErrors },
            },
        },
        userController.updateAddress.bind(userController),
    );

    app.delete<{ Params: { addressId: string } }>(
        "/addresses/:addressId",
        {
            schema: {
                ...authenticated(
                    "[Authenticated User] Delete address",
                    "Delete an existing address owned by the authenticated user.",
                ),
                params: { type: "object", required: ["addressId"], properties: { addressId: { type: "string" } } },
                response: { 200: successResponse(), ...commonErrors },
            },
        },
        userController.deleteAddress.bind(userController),
    );

    // Phone verification and updates
    app.post(
        "/phone/request-otp",
        {
            schema: {
                ...authenticated(
                    "[Authenticated User] Request phone verification OTP",
                    "Send an SMS OTP to verify the authenticated user's phone number.",
                    userSchemas.phoneOtpBody,
                ),
                response: { 200: successResponse(), ...commonErrors },
            },
        },
        userController.requestPhoneOtp.bind(userController),
    );

    app.put(
        "/phone",
        {
            schema: {
                ...authenticated(
                    "[Authenticated User] Verify phone with OTP",
                    "Verifies user phone number using OTP code and marks phoneVerified as true.",
                    userSchemas.phoneVerificationBody,
                ),
                response: { 200: successResponse(), ...commonErrors },
            },
        },
        userController.verifyPhone.bind(userController),
    );
};

export default userRouter;