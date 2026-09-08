import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { invalidateAuthContext } from "@/common/utils/auth-cache.js";
import type { Prisma, UserStatus } from "@/generated/prisma/client.js";
import type {
    AdminUserQueryPayload,
    AdminUserStatusUpdatePayload,
    AdminUserUpdatePayload,
} from "../user.validation.js";

export interface CustomerSummary {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    status: UserStatus;
    emailVerified: boolean;
    phoneVerified: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    roles: string[];
    totalOrders: number;
    totalSpend: number;
    tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    riskFlag: boolean;
    actionNeeded: boolean;
    lastOrderDate: Date | null;
}

/**
 * Service managing Admin Customer Intelligence, 360-Degree Views, Analytics KPIs, and Account Moderation.
 */
export class UserAdminService {
    /**
     * Dynamically computes customer loyalty tiers, lifetime spend, risk scores, and action flags.
     *
     * @param user - Raw user entity with joined orders and roles
     * @returns Computed CustomerSummary model
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
        const orders = user.orders || [];
        const totalOrders = orders.length;

        // Calculate valid spend excluding cancelled, expired, or refunded orders
        const validOrders = orders.filter(
            (o) => o.status !== "CANCELLED" && o.status !== "EXPIRED" && o.status !== "REFUNDED",
        );
        const totalSpend = Number(
            validOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0).toFixed(2),
        );

        // Loyalty Tier evaluation
        let tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" = "BRONZE";
        if (totalSpend >= 5000) tier = "PLATINUM";
        else if (totalSpend >= 1000) tier = "GOLD";
        else if (totalSpend >= 200) tier = "SILVER";

        // Risk Scoring (0–100)
        const cancelledOrders = orders.filter((o) => o.status === "CANCELLED" || o.status === "REFUNDED").length;

        let riskScore = 0;
        if (!user.emailVerified) riskScore += 15;
        if (!user.phoneVerified) riskScore += 15;
        if (user.status === "BLOCKED") riskScore += 50;
        if (user.status === "SUSPENDED") riskScore += 35;
        if (user.status === "PENDING_VERIFICATION") riskScore += 20;
        if (totalOrders > 0 && cancelledOrders / totalOrders >= 0.4) riskScore += 25;
        riskScore = Math.min(100, Math.max(0, riskScore));

        const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
            riskScore >= 70 ? "HIGH" : riskScore >= 35 ? "MEDIUM" : "LOW";
        const riskFlag = riskScore >= 40 || user.status === "SUSPENDED" || user.status === "BLOCKED";
        const actionNeeded =
            user.status === "PENDING_VERIFICATION" || user.status === "SUSPENDED" || riskScore >= 50;

        const sortedOrders = [...orders].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        const lastOrderDate = sortedOrders.length > 0 && sortedOrders[0]?.createdAt ? sortedOrders[0].createdAt : null;

        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            avatarUrl: user.avatarUrl ?? null,
            status: user.status,
            emailVerified: user.emailVerified,
            phoneVerified: user.phoneVerified,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt,
            roles: user.roles ? user.roles.map((r) => r.role.name) : [],
            totalOrders,
            totalSpend,
            tier,
            riskScore,
            riskLevel,
            riskFlag,
            actionNeeded,
            lastOrderDate,
        };
    }

    /**
     * Admin: List users with multi-field search, status filtering, tier filtering, and ecommerce metrics.
     *
     * @param query - Pagination, search keyword, and sorting filters
     */
    async listAdminUsers(query: AdminUserQueryPayload) {
        const { page = 1, limit = 20, search, status, tier, riskFlagOnly, sortBy = "createdAt", sortOrder = "desc" } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...(status ? { status } : {}),
            ...(search
                ? {
                    OR: [
                        { email: { contains: search, mode: "insensitive" } },
                        { firstName: { contains: search, mode: "insensitive" } },
                        { lastName: { contains: search, mode: "insensitive" } },
                        { phone: { contains: search, mode: "insensitive" } },
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
                        select: { id: true, status: true, grandTotal: true, createdAt: true },
                    },
                },
            }),
            prisma.user.count({ where }),
        ]);

        let items: CustomerSummary[] = users.map((u: any) => this.computeCustomerMetrics(u));

        // In-memory filters for computed tier and risk flags
        if (tier && tier !== "ALL") {
            items = items.filter((item) => item.tier === tier);
        }
        if (riskFlagOnly) {
            items = items.filter((item) => item.riskFlag);
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
     *
     * @param userId - Unique UUID of the customer
     */
    async getCustomer360(userId: string) {
        const user: any = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: {
                roles: { select: { role: { select: { id: true, name: true } } } },
                addresses: {
                    select: {
                        id: true,
                        recipientName: true,
                        addressLine1: true,
                        addressLine2: true,
                        city: true,
                        state: true,
                        postalCode: true,
                        country: true,
                        createdAt: true,
                    },
                },
                orders: {
                    orderBy: { createdAt: "desc" },
                    include: {
                        items: {
                            select: {
                                id: true,
                                productName: true,
                                quantity: true,
                                unitPrice: true,
                                total: true,
                            },
                        },
                    },
                },
                reviews: {
                    orderBy: { createdAt: "desc" },
                    include: {
                        product: { select: { id: true, name: true, slug: true } },
                    },
                },
                sessions: {
                    where: { revokedAt: null },
                    select: {
                        id: true,
                        ipAddress: true,
                        userAgent: true,
                        createdAt: true,
                        lastUsedAt: true,
                        expiresAt: true,
                    },
                },
                carts: {
                    include: {
                        items: { select: { id: true, quantity: true } },
                    },
                },
                wishlist: {
                    include: {
                        items: { select: { productId: true } },
                    },
                },
            },
        });

        if (!user) {
            throw new AppError("Customer not found", 404);
        }

        const metrics = this.computeCustomerMetrics(user);

        const orders = user.orders || [];
        const completedOrders = orders.filter((o: any) => o.status === "DELIVERED" || o.status === "CONFIRMED" || o.status === "SHIPPED").length;
        const cancelledOrders = orders.filter((o: any) => o.status === "CANCELLED" || o.status === "REFUNDED" || o.status === "EXPIRED").length;
        const averageOrderValue = metrics.totalOrders > 0 ? Number((metrics.totalSpend / Math.max(1, completedOrders)).toFixed(2)) : 0;

        const reviews = user.reviews || [];
        const avgRatingGiven = reviews.length > 0
            ? Number((reviews.reduce((sum: number, r: any) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1))
            : null;

        const activeCartItems = user.carts.reduce((acc: number, c: any) => acc + c.items.reduce((s: number, i: any) => s + i.quantity, 0), 0);
        const wishlistItemsCount = user.wishlist?.items.length || 0;

        return {
            profile: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                avatarUrl: user.avatarUrl,
                status: user.status,
                emailVerified: user.emailVerified,
                phoneVerified: user.phoneVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLoginAt: user.lastLoginAt,
                roles: user.roles.map((r: any) => r.role.name),
            },
            summary: {
                tier: metrics.tier,
                totalSpend: metrics.totalSpend,
                totalOrders: metrics.totalOrders,
                completedOrders,
                cancelledOrders,
                averageOrderValue,
                riskScore: metrics.riskScore,
                riskLevel: metrics.riskLevel,
                riskFlag: metrics.riskFlag,
                actionNeeded: metrics.actionNeeded,
            },
            engagement: {
                totalReviews: reviews.length,
                averageRatingGiven: avgRatingGiven,
                activeCartItemsCount: activeCartItems,
                wishlistItemsCount,
            },
            addresses: user.addresses,
            recentOrders: orders.slice(0, 5).map((o: any) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                grandTotal: Number(o.grandTotal),
                itemCount: o.items.length,
                items: o.items,
                createdAt: o.createdAt,
            })),
            recentReviews: reviews.slice(0, 5).map((r: any) => ({
                id: r.id,
                product: r.product,
                rating: r.rating,
                title: r.title,
                comment: r.comment,
                status: r.status,
                createdAt: r.createdAt,
            })),
            activeSessions: user.sessions,
        };
    }

    /**
     * Admin: Aggregated Customer Metrics Dashboard.
     * Computes total accounts, active customers, repeat purchase rate, and tier distribution.
     */
    async getAdminUserMetrics() {
        const [allUsers, orders] = await Promise.all([
            prisma.user.findMany({
                where: { deletedAt: null },
                select: {
                    id: true,
                    status: true,
                    emailVerified: true,
                    phoneVerified: true,
                    createdAt: true,
                    orders: {
                        select: { id: true, status: true, grandTotal: true },
                    },
                },
            }),
            prisma.order.findMany({
                where: { status: { notIn: ["CANCELLED", "EXPIRED", "REFUNDED"] } },
                select: { userId: true, grandTotal: true },
            }),
        ]);

        const totalCustomers = allUsers.length;
        const activeCustomers = allUsers.filter((u: any) => u.status === "ACTIVE").length;

        // New customers this calendar month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const newCustomersThisMonth = allUsers.filter((u: any) => new Date(u.createdAt) >= startOfMonth).length;

        // Repeat purchase rate: customers with >= 2 non-cancelled orders / total customers with >= 1 order
        const customerOrderCounts = new Map<string, number>();
        let totalRevenue = 0;

        for (const order of orders) {
            if (order.userId) {
                customerOrderCounts.set(order.userId, (customerOrderCounts.get(order.userId) || 0) + 1);
            }
            totalRevenue += Number(order.grandTotal || 0);
        }

        const orderingCustomersCount = customerOrderCounts.size;
        let repeatCustomersCount = 0;
        customerOrderCounts.forEach((count) => {
            if (count >= 2) repeatCustomersCount++;
        });

        const repeatPurchaseRate = orderingCustomersCount > 0
            ? Number(((repeatCustomersCount / orderingCustomersCount) * 100).toFixed(1))
            : 0;

        const averageLifetimeValue = totalCustomers > 0
            ? Number((totalRevenue / totalCustomers).toFixed(2))
            : 0;

        const statusDistribution: Record<UserStatus, number> = {
            ACTIVE: 0,
            SUSPENDED: 0,
            BLOCKED: 0,
            PENDING_VERIFICATION: 0,
        };

        const tierDistribution = {
            BRONZE: 0,
            SILVER: 0,
            GOLD: 0,
            PLATINUM: 0,
        };

        let riskFlaggedAccounts = 0;

        for (const u of allUsers) {
            statusDistribution[u.status] = (statusDistribution[u.status] || 0) + 1;

            const userSpend = u.orders
                .filter((o: any) => o.status !== "CANCELLED" && o.status !== "EXPIRED" && o.status !== "REFUNDED")
                .reduce((sum: number, o: any) => sum + Number(o.grandTotal || 0), 0);

            if (userSpend >= 5000) tierDistribution.PLATINUM++;
            else if (userSpend >= 1000) tierDistribution.GOLD++;
            else if (userSpend >= 200) tierDistribution.SILVER++;
            else tierDistribution.BRONZE++;

            if (u.status === "SUSPENDED" || u.status === "BLOCKED" || (!u.emailVerified && !u.phoneVerified)) {
                riskFlaggedAccounts++;
            }
        }

        return {
            totalCustomers,
            activeCustomers,
            newCustomersThisMonth,
            repeatPurchaseRate,
            averageLifetimeValue,
            riskFlaggedAccounts,
            statusDistribution,
            tierDistribution,
        };
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
