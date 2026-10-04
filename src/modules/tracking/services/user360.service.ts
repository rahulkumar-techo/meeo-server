import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { auditLogService } from "@/modules/audit/services/auditLog.service.js";

export interface RequesterAuthContext {
    userId: string;
    permissions: string[];
    isStaff?: boolean;
}

export class User360Service {
    /**
     * Builds comprehensive 360 view for a customer using pre-aggregated tables.
     * Enforces dynamic permission & resource-scoped field filtering.
     */
    async getUser360(targetUserId: string, requester: RequesterAuthContext) {
        const isSelf = requester.userId === targetUserId;
        const grantedPermissions = new Set(requester.permissions);
        const hasFullAccess = grantedPermissions.has(PERMISSIONS.SYSTEM_MANAGE);

        // Access Gate: User can view self; staff requires USER_360_VIEW
        if (!isSelf && !hasFullAccess && !grantedPermissions.has(PERMISSIONS.USER_360_VIEW)) {
            throw new AppError("Forbidden: insufficient permissions to view User 360", 403);
        }

        // 1. Fetch user profile
        const user = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                status: true,
                createdAt: true,
                lastLoginAt: true,
            },
        });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        // 2. Fetch pre-aggregated behaviour summary
        const canViewBehavior = isSelf || hasFullAccess || grantedPermissions.has(PERMISSIONS.USER_BEHAVIOR_VIEW);
        const behaviorSummary = canViewBehavior
            ? await prisma.userBehaviorSummary.findUnique({ where: { userId: targetUserId } })
            : null;

        // 3. Fetch top interest affinities
        const canViewInsights = isSelf || hasFullAccess || grantedPermissions.has(PERMISSIONS.USER_INSIGHTS_VIEW);
        const topInterests = canViewInsights
            ? await prisma.userInterest.findMany({
                  where: { userId: targetUserId },
                  orderBy: { score: "desc" },
                  take: 5,
                  select: {
                      type: true,
                      entityId: true,
                      score: true,
                      viewCount: true,
                      cartCount: true,
                      purchaseCount: true,
                  },
              })
            : [];

        // 4. Pre-aggregate commerce metrics from orders
        const canViewCommerce = isSelf || hasFullAccess || grantedPermissions.has(PERMISSIONS.USER_COMMERCE_VIEW);
        let commerceMetrics: Record<string, any> | null = null;
        let recentOrders: any[] = [];

        if (canViewCommerce) {
            const orders = await prisma.order.findMany({
                where: { userId: targetUserId },
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    grandTotal: true,
                    createdAt: true,
                    items: { select: { quantity: true } },
                },
                orderBy: { createdAt: "desc" },
            });

            const completedOrders = orders.filter(
                (o) => o.status === "DELIVERED" || o.status === "CONFIRMED" || o.status === "PROCESSING" || o.status === "SHIPPED",
            );
            const cancelledOrders = orders.filter((o) => o.status === "CANCELLED");

            const totalSpend = completedOrders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
            const averageOrderValue = completedOrders.length > 0 ? Number((totalSpend / completedOrders.length).toFixed(2)) : 0;

            commerceMetrics = {
                totalSpend: Number(totalSpend.toFixed(2)),
                totalOrders: orders.length,
                completedOrders: completedOrders.length,
                cancelledOrders: cancelledOrders.length,
                averageOrderValue,
                firstOrderAt: orders.length > 0 ? (orders[orders.length - 1]?.createdAt ?? null) : null,
                lastOrderAt: orders.length > 0 ? (orders[0]?.createdAt ?? null) : null,
            };

            // Lightweight recent 5 orders
            recentOrders = orders.slice(0, 5).map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                grandTotal: Number(o.grandTotal),
                itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
                createdAt: o.createdAt,
            }));
        }

        // 5. Funnel calculations (Safe zero-denominator handling)
        let funnelMetrics: Record<string, number> | null = null;
        if (behaviorSummary && canViewInsights) {
            const views = behaviorSummary.productViews;
            const carts = behaviorSummary.cartAdds;
            const checkouts = behaviorSummary.checkoutStarted;
            const purchases = behaviorSummary.paymentSuccess;

            const viewToCartPercent = views > 0 ? Number(((carts / views) * 100).toFixed(2)) : 0;
            const cartToCheckoutPercent = carts > 0 ? Number(((checkouts / carts) * 100).toFixed(2)) : 0;
            const checkoutToPurchasePercent = checkouts > 0 ? Number(((purchases / checkouts) * 100).toFixed(2)) : 0;
            const cartAbandonmentPercent = carts > 0 ? Number((Math.max(0, 1 - checkouts / carts) * 100).toFixed(2)) : 0;

            funnelMetrics = {
                viewToCartPercent,
                cartToCheckoutPercent,
                checkoutToPurchasePercent,
                cartAbandonmentPercent,
            };
        }

        // 6. Recent 10 activity events (lightweight preview)
        const recentActivity = await prisma.userEvent.findMany({
            where: { userId: targetUserId },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
                id: true,
                event: true,
                entityType: true,
                entityId: true,
                createdAt: true,
            },
        });

        // 7. Non-blocking audit log if staff accessed another user's profile
        if (!isSelf) {
            auditLogService.recordLog({
                actorId: requester.userId,
                action: "USER_360_VIEWED",
                entityType: "USER",
                entityId: targetUserId,
            }).catch(() => {});
        }

        return {
            profile: user,
            ...(canViewCommerce ? { commerce: commerceMetrics } : {}),
            ...(canViewBehavior ? { behavior: behaviorSummary } : {}),
            ...(canViewInsights ? { insights: { funnel: funnelMetrics, topInterests } } : {}),
            recentOrders,
            recentActivity,
        };
    }

    /**
     * Paginated cursor-based retrieval of raw customer activity logs
     */
    async getUserActivity(targetUserId: string, cursor?: string, limit = 20, requester?: RequesterAuthContext) {
        if (requester) {
            const isSelf = requester.userId === targetUserId;
            const granted = new Set(requester.permissions);
            if (!isSelf && !granted.has(PERMISSIONS.SYSTEM_MANAGE) && !granted.has(PERMISSIONS.USER_ACTIVITY_VIEW) && !granted.has(PERMISSIONS.USER_360_VIEW)) {
                throw new AppError("Forbidden: insufficient permissions to view activity", 403);
            }
        }

        const events = await prisma.userEvent.findMany({
            where: { userId: targetUserId },
            orderBy: { createdAt: "desc" },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
                id: true,
                event: true,
                entityType: true,
                entityId: true,
                metadata: true,
                createdAt: true,
            },
        });

        const hasNextPage = events.length > limit;
        const items = hasNextPage ? events.slice(0, limit) : events;
        const nextCursor = hasNextPage ? (items[items.length - 1]?.id ?? null) : null;

        return {
            items,
            nextCursor,
            hasNextPage,
        };
    }
}

export const user360Service = new User360Service();
