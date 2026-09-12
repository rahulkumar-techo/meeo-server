import { AppError } from "@/common/errors/app-error.js";
import type { IPaymentProvider } from "./paymentProvider.interface.js";
import { RazorpayPaymentProvider } from "./razorpayPayment.provider.js";
import { StripePaymentProvider } from "./stripePayment.provider.js";

export class PaymentProviderRegistry {
    private readonly providers = new Map<string, IPaymentProvider>();

    constructor() {
        this.registerProvider(new RazorpayPaymentProvider());
        this.registerProvider(new StripePaymentProvider());
    }

    registerProvider(provider: IPaymentProvider) {
        this.providers.set(provider.name.toUpperCase(), provider);
    }

    getProvider(name?: string): IPaymentProvider {
        const normalized = (name || "RAZORPAY").toUpperCase();
        const provider = this.providers.get(normalized);
        if (!provider) {
            throw new AppError(`Unsupported payment provider "${name}". Available: ${Array.from(this.providers.keys()).join(", ")}`, 400);
        }
        return provider;
    }

    listProviders(): string[] {
        return Array.from(this.providers.keys());
    }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
