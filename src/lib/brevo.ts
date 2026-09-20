import { BrevoClient } from "@getbrevo/brevo";

let brevoClientInstance: BrevoClient | null = null;

/**
 * Returns a singleton instance of BrevoClient if BREVO_API_KEY is configured.
 */
export function getBrevoClient(): BrevoClient | null {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_API_KEY_HERE") {
        return null;
    }

    if (!brevoClientInstance) {
        brevoClientInstance = new BrevoClient({
            apiKey,
        });
    }

    return brevoClientInstance;
}

/**
 * Helper to test Brevo account connectivity.
 */
export async function verifyBrevoAccount(): Promise<any> {
    const client = getBrevoClient();
    if (!client) {
        throw new Error("BREVO_API_KEY is not configured in environment variables");
    }
    return client.account.getAccount();
}
