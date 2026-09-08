import { userProfileService } from "./userProfile.service.js";
import { userAddressService } from "./userAddress.service.js";
import { userPhoneService } from "./userPhone.service.js";
import { userAdminService } from "./userAdmin.service.js";
import type {
    PhoneOtpRequestPayload,
    PhoneVerificationPayload,
    UserAddressPayload,
    UserProfilePayload,
    AdminUserUpdatePayload,
    AdminUserQueryPayload,
    AdminUserStatusUpdatePayload,
} from "../user.validation.js";

// Re-export modular sub-services and interfaces for direct specialized consumption
export { userProfileService, UserProfileService } from "./userProfile.service.js";
export { userAddressService, UserAddressService } from "./userAddress.service.js";
export { userPhoneService, UserPhoneService } from "./userPhone.service.js";
export { userAdminService, UserAdminService } from "./userAdmin.service.js";
export type { CustomerSummary } from "./userAdmin.service.js";

/**
 * Unified UserService orchestrator facade.
 * Delegates specialized domain logic across modular sub-services:
 * - UserProfileService: Name & identity updates
 * - UserAddressService: Address CRUD & ownership validation
 * - UserPhoneService: Phone verification & Redis OTP lifecycle
 * - UserAdminService: Customer 360 intelligence, metrics, & moderation
 */
export class UserService {
    // ----------------------------------------------------
    // Profile Operations (UserProfileService)
    // ----------------------------------------------------

    /**
     * Updates profile first name and last name for an authenticated user.
     */
    async updateProfile(userId: string, payload: UserProfilePayload) {
        return userProfileService.updateProfile(userId, payload);
    }

    // ----------------------------------------------------
    // Address Operations (UserAddressService)
    // ----------------------------------------------------

    /**
     * Creates or updates a delivery/billing address owned by the requesting user.
     */
    async saveAddress(
        isUpdate: boolean,
        userId: string,
        payload: UserAddressPayload,
        addressId?: string,
    ) {
        return userAddressService.saveAddress(isUpdate, userId, payload, addressId);
    }

    /**
     * Safely deletes an address owned by the requesting user.
     */
    async deleteAddress(userId: string, addressId: string) {
        return userAddressService.deleteAddress(userId, addressId);
    }

    // ----------------------------------------------------
    // Phone Verification Operations (UserPhoneService)
    // ----------------------------------------------------

    /**
     * Requests an SMS verification OTP for adding or updating a phone number.
     */
    async requestPhoneOtp(userId: string, payload: PhoneOtpRequestPayload) {
        return userPhoneService.requestPhoneOtp(userId, payload);
    }

    /**
     * Verifies the submitted OTP against Redis and updates user's phone status.
     */
    async verifyPhone(userId: string, payload: PhoneVerificationPayload) {
        return userPhoneService.verifyPhone(userId, payload);
    }

    // ----------------------------------------------------
    // Admin Customer Intelligence & Management (UserAdminService)
    // ----------------------------------------------------

    /**
     * Admin: Retrieves paginated customers enriched with spend, loyalty tier, and risk score.
     */
    async listAdminUsers(query: AdminUserQueryPayload) {
        return userAdminService.listAdminUsers(query);
    }

    /**
     * Admin: Customer 360-degree comprehensive intelligence profile.
     */
    async getCustomer360(userId: string) {
        return userAdminService.getCustomer360(userId);
    }

    /**
     * Admin: Aggregated customer KPIs and tier distribution metrics dashboard.
     */
    async getAdminUserMetrics() {
        return userAdminService.getAdminUserMetrics();
    }

    /**
     * Admin: Updates customer status (ACTIVE, SUSPENDED, BLOCKED) and invalidates active sessions.
     */
    async updateUserStatus(userId: string, input: AdminUserStatusUpdatePayload) {
        return userAdminService.updateUserStatus(userId, input);
    }

    /**
     * Admin/Generic: Lists all users with their assigned roles.
     */
    async listUsers() {
        return userAdminService.listUsers();
    }

    /**
     * Admin/Generic: Modifies user account details and status.
     */
    async updateUser(userId: string, payload: AdminUserUpdatePayload) {
        return userAdminService.updateUser(userId, payload);
    }
}

export const userService = new UserService();
export default userService;
