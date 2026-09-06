import { randomBytes } from "node:crypto";

export class OrderNumberService {
    /**
     * Generates a unique, human-friendly order reference number (e.g. ORD-20260906-A8F2K).
     */
    generateOrderNumber(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const datePart = `${year}${month}${day}`;

        // 5 random uppercase alphanumeric characters
        const randomPart = randomBytes(4)
            .toString("hex")
            .toUpperCase()
            .slice(0, 5);

        return `ORD-${datePart}-${randomPart}`;
    }
}

export const orderNumberService = new OrderNumberService();
