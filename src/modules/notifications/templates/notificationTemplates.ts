export interface NotificationContent {
    subject: string;
    title: string;
    body: string;
    html: string;
    pushTitle?: string;
    pushBody?: string;
    data?: Record<string, any>;
}

export interface NotificationTemplateDefinition {
    type: string;
    category: "orderUpdates" | "promotions" | "securityAlerts" | "lowStockAlerts";
    subject: string;
    title: string;
    body: string;
    html: string;
}

/**
 * Replaces {{variableName}} tokens inside a template string with actual values.
 */
export function interpolateVariables(template: string, vars: Record<string, any> = {}): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
        const val = vars[key];
        return val !== undefined && val !== null ? String(val) : match;
    });
}

/**
 * Pre-configured notification templates for e-commerce domain events.
 */
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplateDefinition> = {
    ORDER_CONFIRMED: {
        type: "ORDER_CONFIRMED",
        category: "orderUpdates",
        subject: "Order Confirmation - #{{orderNumber}}",
        title: "Order Confirmed!",
        body: "Hello {{customerName}}, your order #{{orderNumber}} has been confirmed and is being prepared for fulfillment.",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #4f46e5; margin-top: 0;">🎉 Order Confirmed!</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Thank you for your purchase. We have received your order <strong>#{{orderNumber}}</strong> and are preparing it for shipment.</p>
                    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Total Amount:</strong> {{currency}} {{totalAmount}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Status:</strong> Confirmed</p>
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">You can track your order status anytime in your dashboard.</p>
                </div>
            </div>
        `.trim(),
    },

    ORDER_SHIPPED: {
        type: "ORDER_SHIPPED",
        category: "orderUpdates",
        subject: "Your Order #{{orderNumber}} is on its way!",
        title: "Order Shipped!",
        body: "Your order #{{orderNumber}} has shipped via {{carrier}}. Tracking Number: {{trackingNumber}}.",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #0284c7; margin-top: 0;">🚚 Your Order Has Shipped!</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Great news! Your package for order <strong>#{{orderNumber}}</strong> is on the way.</p>
                    <div style="background: #f0f9ff; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #bae6fd;">
                        <p style="margin: 0;"><strong>Carrier:</strong> {{carrier}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Tracking Number:</strong> {{trackingNumber}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Estimated Delivery:</strong> {{estimatedDelivery}}</p>
                    </div>
                </div>
            </div>
        `.trim(),
    },

    ORDER_DELIVERED: {
        type: "ORDER_DELIVERED",
        category: "orderUpdates",
        subject: "Delivered: Order #{{orderNumber}}",
        title: "Package Delivered!",
        body: "Your order #{{orderNumber}} has been successfully delivered. We hope you enjoy your purchase!",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #16a34a; margin-top: 0;">📦 Delivered!</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your order <strong>#{{orderNumber}}</strong> has been delivered. We hope everything arrived in perfect condition.</p>
                </div>
            </div>
        `.trim(),
    },

    PAYMENT_SUCCESS: {
        type: "PAYMENT_SUCCESS",
        category: "orderUpdates",
        subject: "Payment Receipt for Order #{{orderNumber}}",
        title: "Payment Successful",
        body: "We received your payment of {{currency}} {{amount}} for order #{{orderNumber}}.",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #16a34a; margin-top: 0;">💳 Payment Receipt</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your payment for order <strong>#{{orderNumber}}</strong> was successfully processed.</p>
                    <div style="background: #f0fdf4; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #bbf7d0;">
                        <p style="margin: 0;"><strong>Amount Paid:</strong> {{currency}} {{amount}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Payment Method:</strong> {{provider}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Transaction ID:</strong> {{transactionId}}</p>
                    </div>
                </div>
            </div>
        `.trim(),
    },

    PAYMENT_FAILED: {
        type: "PAYMENT_FAILED",
        category: "orderUpdates",
        subject: "Action Required: Payment Failed for Order #{{orderNumber}}",
        title: "Payment Failed",
        body: "Your payment for order #{{orderNumber}} could not be processed. Please update your payment method.",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #dc2626; margin-top: 0;">⚠️ Payment Failed</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>We were unable to process your payment for order <strong>#{{orderNumber}}</strong>.</p>
                    <p><strong>Reason:</strong> {{reason}}</p>
                    <p>Please log in to your account and retry your payment.</p>
                </div>
            </div>
        `.trim(),
    },

    LOW_STOCK: {
        type: "LOW_STOCK",
        category: "lowStockAlerts",
        subject: "⚠️ Low Stock Alert: {{productName}}",
        title: "Low Inventory Warning",
        body: "Product {{productName}} (SKU: {{sku}}) has dropped to {{remainingStock}} units remaining.",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #111827; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #d97706; margin-top: 0;">⚠️ Low Stock Alert</h2>
                    <p><strong>Product:</strong> {{productName}}</p>
                    <p><strong>SKU:</strong> {{sku}}</p>
                    <p><strong>Remaining Available Stock:</strong> {{remainingStock}} units</p>
                    <p><strong>Threshold:</strong> {{threshold}} units</p>
                </div>
            </div>
        `.trim(),
    },
};

/**
 * Renders a complete NotificationContent object using a template and input variables.
 */
export function renderNotificationContent(
    eventType: string,
    variables: Record<string, any> = {},
): NotificationContent {
    const template = NOTIFICATION_TEMPLATES[eventType] || {
        type: eventType,
        category: "orderUpdates",
        subject: `Notification: ${eventType}`,
        title: `Event: ${eventType}`,
        body: `A new ${eventType} event has occurred.`,
        html: `<p>A new ${eventType} event has occurred.</p>`,
    };

    return {
        subject: interpolateVariables(template.subject, variables),
        title: interpolateVariables(template.title, variables),
        body: interpolateVariables(template.body, variables),
        html: interpolateVariables(template.html, variables),
        pushTitle: interpolateVariables(template.title, variables),
        pushBody: interpolateVariables(template.body, variables),
        data: variables,
    };
}
