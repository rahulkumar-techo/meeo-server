import cron, { type ScheduledTask } from "node-cron";
import { orderFulfillmentService } from "@/modules/orders/services/orderFulfillment.service.js";
import { reservationService } from "@/modules/inventory/services/reservation.service.js";

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
            console.log(`[Cron: Order Sweeper] Expired ${expiredOrders.value.expiredCount} stale order(s)`);
        }
        if (expiredReservations.status === "fulfilled" && expiredReservations.value.expiredCount > 0) {
            console.log(`[Cron: Reservation Sweeper] Expired ${expiredReservations.value.expiredCount} reservation(s)`);
        }
    } catch (err: any) {
        console.error("[Cron: Order Sweeper Error]:", err.message);
    } finally {
        isSweeping = false;
    }
}

// Start order sweeper cron (default: runs every 5 minutes)
export function startOrderSweeperCron(cronExpression = "*/5 * * * *") {
    if (sweeperTask) return;
    const expression = process.env.ORDER_SWEEPER_CRON_EXPRESSION || cronExpression;
    sweeperTask = cron.schedule(expression, runOrderSweep);
    console.log(`✅ Order sweeper cron scheduled with "${expression}"`);
}

// Stop order sweeper cron
export function stopOrderSweeperCron() {
    if (sweeperTask) {
        sweeperTask.stop();
        sweeperTask = null;
    }
}
