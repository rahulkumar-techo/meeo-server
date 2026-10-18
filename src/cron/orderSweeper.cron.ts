import cron, { type ScheduledTask } from "node-cron";
import { orderFulfillmentService } from "@/modules/orders/services/orderFulfillment.service.js";
import { reservationService } from "@/modules/inventory/services/reservation.service.js";
import { logger } from "@/common/observability/logger.js";

let sweeperTask: ScheduledTask | null = null;
let isSweeping = false;

// Sweep stale pending orders and expired stock reservations
async function runOrderSweep() {
    if (isSweeping) return;

    try {
        isSweeping = true;
        const [expiredOrders, expiredReservations] = await Promise.allSettled([
            orderFulfillmentService.expireStaleOrders(30),
            reservationService.expireStaleReservations(),
        ]);

        if (expiredOrders.status === "fulfilled" && expiredOrders.value.expiredCount > 0) {
            logger.info({ expiredCount: expiredOrders.value.expiredCount }, "[Cron: Order Sweeper] Expired stale orders");
        }
        if (expiredReservations.status === "fulfilled" && expiredReservations.value.expiredCount > 0) {
            logger.info({ expiredCount: expiredReservations.value.expiredCount }, "[Cron: Reservation Sweeper] Expired reservations");
        }
    } catch (err: any) {
        logger.error({ error: err.message }, "[Cron: Order Sweeper Error]");
    } finally {
        isSweeping = false;
    }
}

// Start order sweeper cron (default: runs every 5 minutes)
export function startOrderSweeperCron(cronExpression = "*/5 * * * *") {
    if (sweeperTask) return;
    const expression = process.env.ORDER_SWEEPER_CRON_EXPRESSION || cronExpression;
    sweeperTask = cron.schedule(expression, runOrderSweep);
    logger.info(`Order sweeper cron scheduled with "${expression}"`);
}

// Stop order sweeper cron
export function stopOrderSweeperCron() {
    if (sweeperTask) {
        sweeperTask.stop();
        sweeperTask = null;
    }
}
