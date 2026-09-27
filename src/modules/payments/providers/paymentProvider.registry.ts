import type { IPaymentProvider } from "./paymentProvider.interface.js";
import { RazorpayPaymentProvider } from "./razorpayPayment.provider.js";

export class PaymentProviderRegistry {
    private readonly razorpayProvider: RazorpayPaymentProvider;

    constructor() {
        this.razorpayProvider = new RazorpayPaymentProvider();
    }

    getProvider(_name?: string): IPaymentProvider {
        // Razorpay is the primary, dedicated payment gateway
        return this.razorpayProvider;
    }

    listProviders(): string[] {
        return ["RAZORPAY"];
    }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
