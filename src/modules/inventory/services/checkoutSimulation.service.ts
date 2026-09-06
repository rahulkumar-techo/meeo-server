import { reservationService } from "./reservation.service.js";
import type { SimulateCheckoutInput } from "../validations/inventory.validation.js";

/**
 * Service orchestrating end-to-end checkout & payment test flow simulations.
 */
export class CheckoutSimulationService {
    /**
     * Checkout and Payment Simulation Flow for Testing:
     * 1. Reserve Stock (Available -> Reserved)
     * 2. Simulate Payment outcome
     * 3. Confirm (Reserved -> 0, Completed) OR Release (Reserved -> Available)
     */
    async simulateCheckout(input: SimulateCheckoutInput) {
        const { variantId, quantity, simulatePaymentSuccess, holdMinutes = 15 } = input;

        // Step 1: Reserve Stock
        const reservationResult = await reservationService.reserveStock({
            variantId,
            quantity,
            expiresInMinutes: holdMinutes,
        });

        const timeline = [
            {
                step: 1,
                action: "STOCK_RESERVED",
                status: "SUCCESS",
                message: `Successfully reserved ${quantity} units for checkout.`,
                reservationId: reservationResult.reservation.id,
                expiresAt: reservationResult.reservation.expiresAt,
            },
        ];

        // Step 2: Payment Simulation
        if (simulatePaymentSuccess) {
            const confirmResult = await reservationService.confirmReservation(
                reservationResult.reservation.id,
            );

            timeline.push({
                step: 2,
                action: "SIMULATED_PAYMENT",
                status: "SUCCESS",
                message: "Payment simulation completed successfully.",
                reservationId: reservationResult.reservation.id,
                expiresAt: reservationResult.reservation.expiresAt,
            });

            timeline.push({
                step: 3,
                action: "RESERVATION_CONFIRMED",
                status: "COMPLETED",
                message: "Reservation confirmed and stock successfully committed.",
                reservationId: reservationResult.reservation.id,
                expiresAt: reservationResult.reservation.expiresAt,
            });

            return {
                flowStatus: "ORDER_COMPLETED",
                variantId,
                quantity,
                timeline,
                finalInventory: confirmResult.inventory,
                reservation: confirmResult.reservation,
            };
        } else {
            const releaseResult = await reservationService.releaseReservation(
                reservationResult.reservation.id,
                "Simulated checkout payment failure",
            );

            timeline.push({
                step: 2,
                action: "SIMULATED_PAYMENT",
                status: "FAILED",
                message: "Simulated payment failed / declined by customer.",
                reservationId: reservationResult.reservation.id,
                expiresAt: reservationResult.reservation.expiresAt,
            });

            timeline.push({
                step: 3,
                action: "RESERVATION_RELEASED",
                status: "RESTORED",
                message: "Reservation released and stock restored to available pool.",
                reservationId: reservationResult.reservation.id,
                expiresAt: reservationResult.reservation.expiresAt,
            });

            return {
                flowStatus: "ORDER_CANCELLED_RESTORED",
                variantId,
                quantity,
                timeline,
                finalInventory: releaseResult.inventory,
                reservation: releaseResult.reservation,
            };
        }
    }
}

export const checkoutSimulationService = new CheckoutSimulationService();
