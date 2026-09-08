import type { FastifyInstance } from "fastify";
import { userController } from "./controller/user.controller.js";
import { addressSchema, errorResponse, successResponse, userSchemas } from "@/common/docs/swagger.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

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

    // ----------------------------------------------------
    // Admin Customer Intelligence & User Management
    // ----------------------------------------------------
    app.get(
        "/admin",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: {
                tags: ["User - Admin Management"],
                summary: "[Admin: user:read] List all customers with ecommerce metrics",
                description: "Retrieves paginated customer accounts with lifetime spend, tier, order count, and risk scores.",
                security: [{ bearerAuth: [] }],
            },
        },
        userController.listAdminUsers.bind(userController),
    );

    app.get(
        "/admin/metrics",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: {
                tags: ["User - Admin Management"],
                summary: "[Admin: user:read] Customer analytics metrics",
                description: "Aggregated metrics including total customers, active accounts, repeat purchase rate, and tier distribution.",
                security: [{ bearerAuth: [] }],
            },
        },
        userController.getAdminUserMetrics.bind(userController),
    );

    app.get<{ Params: { userId: string } }>(
        "/admin/:userId/360",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: {
                tags: ["User - Admin Management"],
                summary: "[Admin: user:read] Customer 360-degree view",
                description: "Comprehensive 360 intelligence view including orders history, saved addresses, reviews, active carts, and risk analysis.",
                security: [{ bearerAuth: [] }],
                params: { type: "object", required: ["userId"], properties: { userId: { type: "string" } } },
            },
        },
        userController.getCustomer360.bind(userController),
    );

    app.patch<{ Params: { userId: string } }>(
        "/admin/:userId/status",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: {
                tags: ["User - Admin Management"],
                summary: "[Admin: user:update] Update customer status (Block / Suspend / Activate)",
                description: "Updates user status (ACTIVE, SUSPENDED, BLOCKED, PENDING_VERIFICATION) and automatically revokes active sessions if suspended/blocked.",
                security: [{ bearerAuth: [] }],
                params: { type: "object", required: ["userId"], properties: { userId: { type: "string" } } },
            },
        },
        userController.updateUserStatus.bind(userController),
    );

    app.patch<{ Params: { userId: string } }>(
        "/admin/:userId",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: {
                tags: ["User - Admin Management"],
                summary: "[Admin: user:update] Update user details & status",
                description: "Update first/last name or status of a user. Requires `user:update` permission.",
                security: [{ bearerAuth: [] }],
                params: { type: "object", required: ["userId"], properties: { userId: { type: "string" } } },
            },
        },
        userController.updateUser.bind(userController),
    );

    // ----------------------------------------------------
    // Profile Management
    // ----------------------------------------------------

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