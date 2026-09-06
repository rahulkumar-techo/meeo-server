import type { FastifyReply, FastifyRequest } from "fastify";
import userService from "../services/user.service.js";
import {
    addressSchema,
    phoneOtpRequestSchema,
    phoneVerificationSchema,
    profileSchema,
    adminUserUpdateSchema,
} from "../user.validation.js";
import { sendCreated, sendOk } from "@/common/utils/response.js";

class UserController {

    async listUsers(_request: FastifyRequest, reply: FastifyReply) {
        const result = await userService.listUsers();
        return sendOk({ reply, message: "Users fetched successfully", data: result });
    }

    async updateUser(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
        const data = adminUserUpdateSchema.parse(request.body);
        const result = await userService.updateUser(request.params.userId, data);
        return sendOk({ reply, message: "User updated successfully", data: result });
    }

    /// update profile 
    async updateProfile(request: FastifyRequest, reply: FastifyReply) {
        const data = profileSchema.parse(request.body);
        const result = await userService.updateProfile(request.user.userId, data);

        return sendOk({ reply, message: "Profile updated successfully", data: result });
    }

    /// create a new address
    async createAddress(request: FastifyRequest, reply: FastifyReply) {
        const data = addressSchema.parse(request.body);
        const result = await userService.saveAddress(false, request.user.userId, data);

        return sendCreated({ reply, message: "Address created successfully", data: result });
    }

    /// update an existing address
    async updateAddress(request: FastifyRequest<{ Params: { addressId: string } }>, reply: FastifyReply) {
        const data = addressSchema.parse(request.body);
        const result = await userService.saveAddress(
            true,
            request.user.userId,
            data,
            request.params.addressId,
        );

        return sendOk({ reply, message: "Address updated successfully", data: result });
    }

    /// delete an existing address
    async deleteAddress(request: FastifyRequest<{ Params: { addressId: string } }>, reply: FastifyReply) {
        const result = await userService.deleteAddress(request.user.userId, request.params.addressId);

        return sendOk({ reply, message: result.message });
    }

    /// request an OTP for adding or updating a phone number
    async requestPhoneOtp(request: FastifyRequest, reply: FastifyReply) {
        const data = phoneOtpRequestSchema.parse(request.body);
        const result = await userService.requestPhoneOtp(request.user.userId, data);

        return sendOk({ reply, message: "Phone verification OTP generated", data: result });
    }

    /// verify the OTP and save the phone number
    async verifyPhone(request: FastifyRequest, reply: FastifyReply) {
        const data = phoneVerificationSchema.parse(request.body);
        const result = await userService.verifyPhone(request.user.userId, data);

        return sendOk({ reply, message: "Phone number verified successfully", data: result });
    }
}

export const userController = new UserController();