import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { AddressSnapshotInput } from "../validations/order.validation.js";

export const DEFAULT_STANDARD_SHIPPING_FEE = 10.0;
export const FREE_SHIPPING_THRESHOLD = 100.0;
export const ESTIMATED_TAX_RATE = 0.08; // 8% standard tax estimate

export interface ValidatedCartItem {
    cartItemId: string;
    variantId: string;
    productId: string;
    productName: string;
    sku: string;
    unitPrice: number;
    compareAtPrice: number | null;
    quantity: number;
    lineTotal: number;
    variantSnapshot: any;
    availableStock: number;
}

export interface ValidatedOrderContext {
    cartId: string;
    items: ValidatedCartItem[];
    subtotal: number;
    shippingAddress: AddressSnapshotInput;
    billingAddress: AddressSnapshotInput;
}

export class OrderValidationService {
    /**
     * Resolves and validates the shopping cart, re-calculating canonical pricing directly from the database.
     */
    async validateCartAndItems(userId?: string, cartId?: string, sessionId?: string): Promise<{ cartId: string; items: ValidatedCartItem[]; subtotal: number }> {
        const cart = await prisma.cart.findFirst({
            where: {
                ...(cartId ? { id: cartId } : {}),
                ...(userId ? { userId } : {}),
                ...(!userId && sessionId ? { sessionId } : {}),
            },
            include: {
                items: {
                    include: {
                        variant: {
                            include: {
                                product: {
                                    include: {
                                        images: { take: 1, orderBy: { sortOrder: "asc" } },
                                    },
                                },
                                inventory: true,
                                attributeValues: {
                                    include: {
                                        attributeValue: {
                                            include: {
                                                attribute: { select: { id: true, name: true } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!cart || cart.items.length === 0) {
            throw new AppError("Cannot proceed to checkout with an empty shopping cart", 400);
        }

        const validatedItems: ValidatedCartItem[] = [];
        let subtotal = 0;

        for (const item of cart.items) {
            const variant = item.variant;
            const product = variant.product;

            if (!product || product.status !== "ACTIVE" || product.deletedAt) {
                throw new AppError(
                    `Product "${product?.name ?? "Unknown"}" is no longer available for purchase`,
                    400,
                );
            }

            if (variant.status !== "ACTIVE") {
                throw new AppError(
                    `Product variant (${variant.sku}) for "${product.name}" is currently inactive`,
                    400,
                );
            }

            const availableStock = variant.inventory ? variant.inventory.availableQuantity : 0;
            if (availableStock < item.quantity) {
                throw new AppError(
                    `Insufficient stock for "${product.name}" (${variant.sku}). In stock: ${availableStock}, in cart: ${item.quantity}`,
                    400,
                );
            }

            const unitPrice = Number(variant.price);
            const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
            subtotal += lineTotal;

            const variantSnapshot = {
                sku: variant.sku,
                barcode: variant.barcode,
                thumbnail: product.images?.[0]?.url ?? null,
                attributes: (variant.attributeValues || []).map((av: any) => ({
                    attribute: av.attributeValue?.attribute?.name ?? "Attribute",
                    value: av.attributeValue?.value ?? "",
                })),
            };

            validatedItems.push({
                cartItemId: item.id,
                variantId: variant.id,
                productId: product.id,
                productName: product.name,
                sku: variant.sku,
                unitPrice,
                compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
                quantity: item.quantity,
                lineTotal,
                variantSnapshot,
                availableStock,
            });
        }

        return {
            cartId: cart.id,
            items: validatedItems,
            subtotal: Number(subtotal.toFixed(2)),
        };
    }

    /**
     * Resolves and verifies shipping and billing address snapshots from database address ID or inline payload.
     */
    async resolveAddresses(
        userId?: string,
        shippingAddressId?: string,
        inlineShippingAddress?: AddressSnapshotInput,
        billingAddressId?: string,
        inlineBillingAddress?: AddressSnapshotInput,
    ): Promise<{ shippingAddress: AddressSnapshotInput; billingAddress: AddressSnapshotInput }> {
        let shippingAddress: AddressSnapshotInput | null = null;
        let billingAddress: AddressSnapshotInput | null = null;

        if (shippingAddressId) {
            const savedAddress = await prisma.address.findUnique({
                where: { id: shippingAddressId },
            });

            if (!savedAddress || (userId && savedAddress.userId !== userId)) {
                throw new AppError("Specified shipping address not found or does not belong to user", 404);
            }

            shippingAddress = {
                recipientName: savedAddress.recipientName,
                phone: savedAddress.phone ?? undefined,
                addressLine1: savedAddress.addressLine1,
                addressLine2: savedAddress.addressLine2 ?? undefined,
                city: savedAddress.city,
                state: savedAddress.state,
                postalCode: savedAddress.postalCode,
                country: savedAddress.country,
                latitude: savedAddress.latitude ? Number(savedAddress.latitude) : undefined,
                longitude: savedAddress.longitude ? Number(savedAddress.longitude) : undefined,
            };
        } else if (inlineShippingAddress) {
            shippingAddress = inlineShippingAddress;
        }

        if (!shippingAddress) {
            throw new AppError("A valid delivery shipping address is required for checkout", 400);
        }

        if (billingAddressId) {
            const savedBilling = await prisma.address.findUnique({
                where: { id: billingAddressId },
            });

            if (!savedBilling || (userId && savedBilling.userId !== userId)) {
                throw new AppError("Specified billing address not found or does not belong to user", 404);
            }

            billingAddress = {
                recipientName: savedBilling.recipientName,
                phone: savedBilling.phone ?? undefined,
                addressLine1: savedBilling.addressLine1,
                addressLine2: savedBilling.addressLine2 ?? undefined,
                city: savedBilling.city,
                state: savedBilling.state,
                postalCode: savedBilling.postalCode,
                country: savedBilling.country,
                latitude: savedBilling.latitude ? Number(savedBilling.latitude) : undefined,
                longitude: savedBilling.longitude ? Number(savedBilling.longitude) : undefined,
            };
        } else if (inlineBillingAddress) {
            billingAddress = inlineBillingAddress;
        } else {
            // Fallback billing address to shipping address
            billingAddress = shippingAddress;
        }

        return { shippingAddress, billingAddress };
    }

    /**
     * Calculates shipping fees and estimated taxes.
     */
    calculateFees(subtotal: number, isFreeShipping: boolean = false) {
        let shippingTotal = 0;
        if (!isFreeShipping) {
            shippingTotal = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : DEFAULT_STANDARD_SHIPPING_FEE;
        }

        const taxTotal = Number((subtotal * ESTIMATED_TAX_RATE).toFixed(2));

        return {
            shippingTotal: Number(shippingTotal.toFixed(2)),
            taxTotal,
        };
    }
}

export const orderValidationService = new OrderValidationService();
