import type { FastifyInstance } from "fastify";
import { userController } from "./controller/user.controller.js";
import { addressSchema, errorResponse, successResponse, userSchemas } from "@/common/docs/swagger.js";

const authenticated = (summary: string, body?: object) => ({
    tags: ["User"],
    summary,
    security: [{ bearerAuth: [] }],
    ...(body ? { body } : {}),
});
const commonErrors = { 400: errorResponse, 401: errorResponse, 404: errorResponse, 422: errorResponse };

const userRouter = (app: FastifyInstance) => {
    // Authenticate once for the whole router so every profile, address, and phone operation
    // receives a verified request.user before its controller runs.
    app.addHook("preHandler", app.authenticate);

    // Profile management
    app.patch("/profile", { schema: { ...authenticated("Update the current profile", userSchemas.profileBody), response: { 200: successResponse(), ...commonErrors } } }, userController.updateProfile.bind(userController));

    // Address management
    app.post("/addresses", { schema: { ...authenticated("Create an address", addressSchema), response: { 201: successResponse(), ...commonErrors } } }, userController.createAddress.bind(userController));
    app.patch<{ Params: { addressId: string } }>("/addresses/:addressId", { schema: { ...authenticated("Update an address", addressSchema), params: { type: "object", required: ["addressId"], properties: { addressId: { type: "string" } } }, response: { 200: successResponse(), ...commonErrors } } }, userController.updateAddress.bind(userController));
    app.delete<{ Params: { addressId: string } }>("/addresses/:addressId", { schema: { ...authenticated("Delete an address"), params: { type: "object", required: ["addressId"], properties: { addressId: { type: "string" } } }, response: { 200: successResponse(), ...commonErrors } } }, userController.deleteAddress.bind(userController));

    // Phone verification and updates
    app.post("/phone/request-otp", { schema: { ...authenticated("Request a phone verification OTP", userSchemas.phoneOtpBody), response: { 200: successResponse(), ...commonErrors } } }, userController.requestPhoneOtp.bind(userController));
    app.put("/phone", { schema: { ...authenticated("Verify a phone number", userSchemas.phoneVerificationBody), response: { 200: successResponse(), ...commonErrors } } }, userController.verifyPhone.bind(userController));
};

export default userRouter;