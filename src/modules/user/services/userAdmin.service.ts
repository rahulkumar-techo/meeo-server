import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { invalidateAuthContext } from "@/common/utils/auth-cache.js";
import type { Prisma, UserStatus } from "@/generated/prisma/client.js";
import {
    customerMetricsService,
    type CustomerSummary,
} from "./customerMetrics.service.js";
import type {
    AdminUserQueryPayload,
    AdminUserStatusUpdatePayload,
    AdminUserUpdatePayload,
} from "../user.validation.js";

export type { CustomerSummary };

/**
 * Service managing Admin Customer Intelligence, 360-Degree Views, Analytics KPIs, and Account Moderation.
 */
export class UserAdminService {
    /**
     * Dynamically computes customer loyalty tiers, lifetime spend, risk scores, and action flags.
     */
    computeCustomerMetrics(user: {
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        avatarUrl?: string | null;
        status: UserStatus;
        emailVerified: boolean;
        phoneVerified: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
        roles?: { role: { id: string; name: string } }[];
        orders?: { id: string; status: string; grandTotal: any; createdAt: Date }[];
    }): CustomerSummary {
        return customerMetricsService.computeCustomerMetrics(user);
    }

    /**
     * Admin: List users with multi-field search, status filtering, tier filtering, and ecommerce metrics.
     */
    async listAdminUsers(query: AdminUserQueryPayload) {
        const { page = 1, limit = 20, search, status, tier, riskFlagOnly, sortBy = "createdAt", sortOrder = "desc" } = query;
        const skip = (page - 1) * limit;

        const trimmedSearch = search?.trim();

        // fix:expensive computations - Push risk flag and status filtering directly to SQL WHERE clause to fix in-memory pagination drift
        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...(status ? { status } : {}),
            ...(trimmedSearch
                ? {
                    OR: [
                        { email: { contains: trimmedSearch, mode: "insensitive" } },
                        { firstName: { contains: trimmedSearch, mode: "insensitive" } },
                        { lastName: { contains: trimmedSearch, mode: "insensitive" } },
                        { phone: { contains: trimmedSearch, mode: "insensitive" } },
                    ],
                }
                : {}),
            ...(riskFlagOnly
                ? {
                    OR: [
                        { status: { in: ["SUSPENDED", "BLOCKED"] } },
                        { emailVerified: false, phoneVerified: false },
                    ],
                }
                : {}),
        };

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy === "totalSpend" || sortBy === "totalOrders" || sortBy === "riskScore" ? "createdAt" : sortBy]: sortOrder },
                include: {
                    roles: { select: { role: { select: { id: true, name: true } } } },
                    orders: {
                        where: { status: { notIn: ["CANCELLED", "EXPIRED", "REFUNDED"] } },
                        select: { id: true, status: true, grandTotal: true, createdAt: true },
                    },
                },
            }),
            prisma.user.count({ where }),
        ]);

        let items: CustomerSummary[] = users.map((u: any) => this.computeCustomerMetrics(u));

        // In-memory filters for computed tier if requested
        if (tier && tier !== "ALL") {
            items = items.filter((item) => item.tier === tier);
        }

        // Handle computed sort keys
        if (sortBy === "totalSpend") {
            items.sort((a, b) => (sortOrder === "asc" ? a.totalSpend - b.totalSpend : b.totalSpend - a.totalSpend));
        } else if (sortBy === "totalOrders") {
            items.sort((a, b) => (sortOrder === "asc" ? a.totalOrders - b.totalOrders : b.totalOrders - a.totalOrders));
        } else if (sortBy === "riskScore") {
            items.sort((a, b) => (sortOrder === "asc" ? a.riskScore - b.riskScore : b.riskScore - a.riskScore));
        }

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Admin: Comprehensive Customer 360-Degree Intelligence View.
     */
    async getCustomer360(userId: string) {
        const result = await customerMetricsService.getCustomer360(userId);
        if (!result) {
            throw new AppError("Customer not found", 404);
        }
        return result;
    }

    /**
     * Admin: Aggregated Customer Metrics Dashboard.
     */
    async getAdminUserMetrics() {
        return customerMetricsService.getAdminUserMetrics();
    }

    /**
     * Admin: Update User Status (ACTIVE, SUSPENDED, BLOCKED, PENDING_VERIFICATION).
     * Forcibly terminates active sessions and clears Redis auth cache if account is restricted.
     */
    async updateUserStatus(userId: string, input: AdminUserStatusUpdatePayload) {
        const { status } = input;

        const user = await prisma.user.findUnique({
            where: { id: userId, deletedAt: null },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        await prisma.user.update({
            where: { id: userId },
            data: { status },
        });

        if (status === "SUSPENDED" || status === "BLOCKED") {
            await prisma.userSession.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }

        await invalidateAuthContext(userId);

        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            status,
            updatedAt: new Date(),
        };
    }

    /**
     * Legacy/Generic: List users with roles.
     */
    async listUsers() {
        return prisma.user.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                emailVerified: true,
                phoneVerified: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                roles: { select: { role: { select: { id: true, name: true } } } },
            },
        });
    }

    /**
     * Legacy/Generic: Update user profile names and status.
     */
    async updateUser(userId: string, payload: AdminUserUpdatePayload) {
        const data = {
            ...(payload.firstName === undefined ? {} : { firstName: payload.firstName }),
            ...(payload.lastName === undefined ? {} : { lastName: payload.lastName }),
            ...(payload.status === undefined ? {} : { status: payload.status }),
        };

        const user = await prisma.user.updateMany({
            where: { id: userId, deletedAt: null },
            data,
        });

        if (user.count !== 1) throw new AppError("User not found", 404);

        if (payload.status === "SUSPENDED" || payload.status === "BLOCKED") {
            await prisma.userSession.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }

        await invalidateAuthContext(userId);

        return prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                emailVerified: true,
                phoneVerified: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }
}

export const userAdminService = new UserAdminService();
