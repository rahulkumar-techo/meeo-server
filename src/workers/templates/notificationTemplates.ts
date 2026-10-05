export interface NotificationContent {
    subject: string;
    title: string;
    body: string;
    html: string;
    pushTitle?: string;
    pushBody?: string;
    data?: Record<string, any>;
}

export type NotificationCategory =
    | "order"
    | "payment"
    | "delivery"
    | "returnRefund"
    | "security"
    | "orderUpdates"
    | "securityAlerts"
    | "promotions"
    | "lowStockAlerts";

export interface NotificationTemplateDefinition {
    type: string;
    category: NotificationCategory;
    subject: string;
    title: string;
    body: string;
    html: string;
    pushTitle?: string;
    pushBody?: string;
    // When true, this is a formal billing/invoice/receipt or security-critical event that requires email.
    // When false, push is used everywhere, and email is only used as a fallback if no push devices exist.
    sendEmailByDefault?: boolean;
}

// Replaces {{variableName}} tokens inside a template string
export function interpolateVariables(template: string, vars: Record<string, any> = {}): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
        const val = vars[key];
        return val !== undefined && val !== null ? String(val) : match;
    });
}

// Pre-configured notification templates for customer notification categories and admin alerts
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplateDefinition> = {
    // ----------------------------------------------------
    // Category: Order (Important order-state changes)
    // ----------------------------------------------------
    ORDER_CONFIRMED: {
        type: "ORDER_CONFIRMED",
        category: "order",
        subject: "Order Confirmation - Order #{{orderNumber}}",
        title: "Order Confirmed",
        body: "Hello {{customerName}}, your order #{{orderNumber}} has been confirmed and is being prepared for fulfillment.",
        pushTitle: "Order Confirmed",
        pushBody: "Your order #{{orderNumber}} has been confirmed.",
        sendEmailByDefault: true, // Billing / Order Receipt
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Order Confirmation</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Thank you for your purchase. We have received your order <strong>#{{orderNumber}}</strong> and are preparing it for shipment.</p>
                    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Total Amount:</strong> {{currency}} {{totalAmount}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Status:</strong> Confirmed</p>
                    </div>
                </div>
            </div>
        `.trim(),
    },

    ORDER_PROCESSING: {
        type: "ORDER_PROCESSING",
        category: "order",
        subject: "Order Processing - Order #{{orderNumber}}",
        title: "Order Processing",
        body: "Hello {{customerName}}, your order #{{orderNumber}} is now being processed.",
        pushTitle: "Order Processing",
        pushBody: "Your order #{{orderNumber}} is currently being prepared.",
        sendEmailByDefault: false, // Push only
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Order Processing</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your order <strong>#{{orderNumber}}</strong> is currently being prepared and processed for dispatch.</p>
                </div>
            </div>
        `.trim(),
    },

    ORDER_CANCELLED: {
        type: "ORDER_CANCELLED",
        category: "order",
        subject: "Order Cancelled - Order #{{orderNumber}}",
        title: "Order Cancelled",
        body: "Hello {{customerName}}, your order #{{orderNumber}} has been cancelled.",
        pushTitle: "Order Cancelled",
        pushBody: "Your order #{{orderNumber}} has been cancelled.",
        sendEmailByDefault: true, // Formal cancellation record
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Order Cancelled</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your order <strong>#{{orderNumber}}</strong> has been cancelled.</p>
                </div>
            </div>
        `.trim(),
    },

    // ----------------------------------------------------
    // Category: Payment (Payment status / receipt)
    // ----------------------------------------------------
    PAYMENT_FAILED: {
        type: "PAYMENT_FAILED",
        category: "payment",
        subject: "Payment Failed - Order #{{orderNumber}}",
        title: "Payment Failed",
        body: "Hello {{customerName}}, the payment transaction for order #{{orderNumber}} was unsuccessful. Please update your payment method.",
        pushTitle: "Payment Failed",
        pushBody: "Payment for order #{{orderNumber}} was unsuccessful. Please check your payment details.",
        sendEmailByDefault: false, // Push alert
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #dc2626; margin-top: 0; font-size: 20px; font-weight: 600;">Payment Failed</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>We were unable to process your payment for order <strong>#{{orderNumber}}</strong>. Please update your payment method to complete your purchase.</p>
                </div>
            </div>
        `.trim(),
    },

    PAYMENT_SUCCESS: {
        type: "PAYMENT_SUCCESS",
        category: "payment",
        subject: "Payment Receipt - Order #{{orderNumber}}",
        title: "Payment Successful",
        body: "We received your payment of {{currency}} {{amount}} for order #{{orderNumber}}.",
        pushTitle: "Payment Received",
        pushBody: "Payment of {{currency}} {{amount}} for order #{{orderNumber}} was successful.",
        sendEmailByDefault: true, // Billing Receipt
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Payment Receipt</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your payment for order <strong>#{{orderNumber}}</strong> was successfully processed.</p>
                    <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #e5e7eb;">
                        <p style="margin: 0;"><strong>Amount Paid:</strong> {{currency}} {{amount}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Payment Method:</strong> {{provider}}</p>
                    </div>
                </div>
            </div>
        `.trim(),
    },

    ORDER_PAID: {
        type: "ORDER_PAID",
        category: "payment",
        subject: "Order Confirmation - Order #{{orderNumber}}",
        title: "Payment Confirmed",
        body: "Hello {{customerName}}, your payment of {{currency}} {{totalAmount}} for order #{{orderNumber}} has been received.",
        pushTitle: "Payment Confirmed",
        pushBody: "Your payment for order #{{orderNumber}} has been confirmed.",
        sendEmailByDefault: true, // Billing Invoice
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Payment Received</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Thank you for your purchase. We have received your payment for order <strong>#{{orderNumber}}</strong>.</p>
                    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Total Paid:</strong> {{currency}} {{totalAmount}}</p>
                    </div>
                </div>
            </div>
        `.trim(),
    },

    // ----------------------------------------------------
    // Category: Delivery (Delivery status changes)
    // ----------------------------------------------------
    ORDER_SHIPPED: {
        type: "ORDER_SHIPPED",
        category: "delivery",
        subject: "Your Order #{{orderNumber}} has shipped",
        title: "Order Shipped",
        body: "Your order #{{orderNumber}} has shipped via {{carrier}}. Tracking Number: {{trackingNumber}}.",
        pushTitle: "Order Shipped",
        pushBody: "Your order #{{orderNumber}} has been shipped via {{carrier}}.",
        sendEmailByDefault: false, // Push only
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Your Order Has Shipped</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your package for order <strong>#{{orderNumber}}</strong> is in transit.</p>
                    <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #e5e7eb;">
                        <p style="margin: 0;"><strong>Carrier:</strong> {{carrier}}</p>
                        <p style="margin: 4px 0 0 0;"><strong>Tracking Number:</strong> {{trackingNumber}}</p>
                    </div>
                </div>
            </div>
        `.trim(),
    },

    ORDER_OUT_FOR_DELIVERY: {
        type: "ORDER_OUT_FOR_DELIVERY",
        category: "delivery",
        subject: "Out for Delivery - Order #{{orderNumber}}",
        title: "Out for Delivery",
        body: "Hello {{customerName}}, your order #{{orderNumber}} is out for delivery today.",
        pushTitle: "Out for Delivery",
        pushBody: "Your order #{{orderNumber}} is out for delivery.",
        sendEmailByDefault: false, // Push only
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Out for Delivery</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your order <strong>#{{orderNumber}}</strong> is out for delivery and will arrive shortly.</p>
                </div>
            </div>
        `.trim(),
    },

    ORDER_DELIVERED: {
        type: "ORDER_DELIVERED",
        category: "delivery",
        subject: "Delivered: Order #{{orderNumber}} - Purchase Invoice and Delivery Confirmation",
        title: "Order Delivered",
        body: "Your order #{{orderNumber}} has been successfully delivered. Thank you for shopping with MEEO.",
        pushTitle: "Order Delivered",
        pushBody: "Your order #{{orderNumber}} has been delivered.",
        sendEmailByDefault: true, // Main notification: Delivery confirmation & final purchase billing invoice
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <div style="margin-bottom: 20px;">
                        <h2 style="color: #111827; margin: 0; font-size: 20px; font-weight: 600;">Order Delivered</h2>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Purchase Invoice & Delivery Confirmation</p>
                    </div>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your order <strong>#{{orderNumber}}</strong> has been successfully delivered.</p>
                    
                    <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin: 20px 0; border: 1px solid #e5e7eb;">
                        <h3 style="margin-top: 0; color: #111827; font-size: 15px; font-weight: 600;">Purchase and Billing Summary</h3>
                        <p style="margin: 4px 0;"><strong>Order Number:</strong> #{{orderNumber}}</p>
                        <p style="margin: 4px 0;"><strong>Total Paid:</strong> {{currency}} {{totalAmount}}</p>
                        <p style="margin: 4px 0;"><strong>Delivery Status:</strong> Completed</p>
                    </div>

                    <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">If you have any questions or need to request a return, please visit your account dashboard.</p>
                </div>
            </div>
        `.trim(),
    },

    // ----------------------------------------------------
    // Category: Return/Refund (Return/refund progress or action)
    // ----------------------------------------------------
    REFUND_INITIATED: {
        type: "REFUND_INITIATED",
        category: "returnRefund",
        subject: "Refund Initiated - Order #{{orderNumber}}",
        title: "Refund Initiated",
        body: "Hello {{customerName}}, your refund for order #{{orderNumber}} has been initiated.",
        pushTitle: "Refund Initiated",
        pushBody: "Your refund for order #{{orderNumber}} has been initiated.",
        sendEmailByDefault: true, // Financial billing refund
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Refund Initiated</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your refund of <strong>{{currency}} {{amount}}</strong> for order <strong>#{{orderNumber}}</strong> has been initiated and will reflect in your account shortly.</p>
                </div>
            </div>
        `.trim(),
    },

    PAYMENT_REFUNDED: {
        type: "PAYMENT_REFUNDED",
        category: "returnRefund",
        subject: "Refund Completed - Order #{{orderNumber}}",
        title: "Refund Completed",
        body: "Hello {{customerName}}, your refund of {{currency}} {{amount}} for order #{{orderNumber}} has been completed.",
        pushTitle: "Refund Completed",
        pushBody: "Your refund of {{currency}} {{amount}} for order #{{orderNumber}} has been completed.",
        sendEmailByDefault: true, // Financial billing credit note
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Refund Completed</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your refund of <strong>{{currency}} {{amount}}</strong> for order <strong>#{{orderNumber}}</strong> was successfully completed.</p>
                </div>
            </div>
        `.trim(),
    },

    PAYMENT_PARTIALLY_REFUNDED: {
        type: "PAYMENT_PARTIALLY_REFUNDED",
        category: "returnRefund",
        subject: "Partial Refund Completed - Order #{{orderNumber}}",
        title: "Partial Refund Completed",
        body: "Hello {{customerName}}, a partial refund of {{currency}} {{amount}} for order #{{orderNumber}} was processed.",
        pushTitle: "Partial Refund Processed",
        pushBody: "A partial refund of {{currency}} {{amount}} for order #{{orderNumber}} was processed.",
        sendEmailByDefault: true, // Financial billing credit note
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Partial Refund Processed</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>A partial refund of <strong>{{currency}} {{amount}}</strong> for order <strong>#{{orderNumber}}</strong> was processed.</p>
                </div>
            </div>
        `.trim(),
    },

    RETURN_REQUESTED: {
        type: "RETURN_REQUESTED",
        category: "returnRefund",
        subject: "Return Request Received - Order #{{orderNumber}}",
        title: "Return Request Under Review",
        body: "Hello {{customerName}}, your return request for order #{{orderNumber}} has been received and is under review.",
        pushTitle: "Return Request Received",
        pushBody: "Your return request for order #{{orderNumber}} is under review.",
        sendEmailByDefault: false, // Push only
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Return Request Received</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your return request for order <strong>#{{orderNumber}}</strong> has been received and is currently under review.</p>
                </div>
            </div>
        `.trim(),
    },

    // ----------------------------------------------------
    // Category: Account/Security (Security-critical event)
    // ----------------------------------------------------
    ACCOUNT_PASSWORD_CHANGED: {
        type: "ACCOUNT_PASSWORD_CHANGED",
        category: "security",
        subject: "Security Notice: Your account password was changed",
        title: "Account Password Changed",
        body: "Hello {{customerName}}, your account password was changed. If you did not make this change, please contact support immediately.",
        pushTitle: "Security Notice: Password Changed",
        pushBody: "Your account password was recently changed.",
        sendEmailByDefault: true, // Critical security audit email
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Password Changed</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Your account password was recently changed. If you performed this action, no further steps are necessary.</p>
                    <p style="color: #dc2626;"><strong>If you did not make this change</strong>, please reset your password immediately or contact our support team.</p>
                </div>
            </div>
        `.trim(),
    },

    SECURITY_ALERT: {
        type: "SECURITY_ALERT",
        category: "security",
        subject: "Security Notice for Your Account",
        title: "Security Notice",
        body: "Hello {{customerName}}, a security event was detected on your account.",
        pushTitle: "Security Notice",
        pushBody: "Important security activity was recorded on your account.",
        sendEmailByDefault: true, // Critical security audit email
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Security Notice</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>A security event was detected on your account.</p>
                </div>
            </div>
        `.trim(),
    },

    // ----------------------------------------------------
    // Admin Alerts (Low Stock)
    // ----------------------------------------------------
    LOW_STOCK: {
        type: "LOW_STOCK",
        category: "lowStockAlerts",
        subject: "Inventory Alert: Low Stock for {{productName}}",
        title: "Low Inventory Warning",
        body: "Product {{productName}} (SKU: {{sku}}) has dropped to {{remainingStock}} units remaining.",
        pushTitle: "Low Stock Alert",
        pushBody: "Product {{productName}} has {{remainingStock}} units remaining.",
        sendEmailByDefault: true,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Low Stock Alert</h2>
                    <p><strong>Product:</strong> {{productName}}</p>
                    <p><strong>SKU:</strong> {{sku}}</p>
                    <p><strong>Remaining Stock:</strong> {{remainingStock}} units</p>
                </div>
            </div>
        `.trim(),
    },

    // ----------------------------------------------------
    // Category: Auth / Account Verification (OTP)
    // ----------------------------------------------------
    USER_REGISTERED: {
        type: "USER_REGISTERED",
        category: "security",
        subject: "Your Verification Code - {{appName}}",
        title: "Your Verification Code",
        body: "Hello {{customerName}}, your verification code is {{otpCode}}.",
        sendEmailByDefault: true, // Verification OTP emails must always be dispatched
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Welcome to {{appName}}</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>Thank you for registering. Please use the verification code below to verify your email address:</p>
                    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
                        <span style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #111827;">{{otpCode}}</span>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">This code will expire in 5 minutes. If you did not create an account, you can safely ignore this email.</p>
                </div>
            </div>
        `.trim(),
    },

    USER_OTP_REQUESTED: {
        type: "USER_OTP_REQUESTED",
        category: "security",
        subject: "Your Verification Code - {{appName}}",
        title: "Your Verification Code",
        body: "Hello {{customerName}}, your verification code is {{otpCode}}.",
        sendEmailByDefault: true,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; line-height: 1.5;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
                    <h2 style="color: #111827; margin-top: 0; font-size: 20px; font-weight: 600;">Verification Code</h2>
                    <p>Dear <strong>{{customerName}}</strong>,</p>
                    <p>We received a request for a verification code. Please use the code below:</p>
                    <div style="background: #f3f4f6; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
                        <span style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #111827;">{{otpCode}}</span>
                    </div>
                    <p style="font-size: 13px; color: #6b7280;">This code will expire in 5 minutes. If you did not request this, please contact support.</p>
                </div>
            </div>
        `.trim(),
    },
};

// Valid customer notification categories
export const CUSTOMER_NOTIFICATION_CATEGORIES = new Set<string>([
    "order",
    "payment",
    "delivery",
    "returnRefund",
    "security",
    "orderUpdates",
    "securityAlerts",
]);

// Checks if an event is a customer notification scenario
export function isCustomerEvent(eventType: string): boolean {
    const template = NOTIFICATION_TEMPLATES[eventType];
    if (!template) return false;
    return CUSTOMER_NOTIFICATION_CATEGORIES.has(template.category);
}

// Renders a complete NotificationContent object
export function renderNotificationContent(
    eventType: string,
    variables: Record<string, any> = {},
): NotificationContent {
    const template = NOTIFICATION_TEMPLATES[eventType] || {
        type: eventType,
        category: "order",
        subject: `Notification: ${eventType}`,
        title: `Event: ${eventType}`,
        body: `A new ${eventType} event has occurred.`,
        pushTitle: `Notification: ${eventType}`,
        pushBody: `A new ${eventType} event has occurred.`,
        html: `<p>A new ${eventType} event has occurred.</p>`,
    };

    return {
        subject: variables.subject ? interpolateVariables(variables.subject, variables) : interpolateVariables(template.subject, variables),
        title: variables.title ? interpolateVariables(variables.title, variables) : interpolateVariables(template.title, variables),
        body: variables.body ? interpolateVariables(variables.body, variables) : interpolateVariables(template.body, variables),
        html: variables.html ? interpolateVariables(variables.html, variables) : interpolateVariables(template.html, variables),
        pushTitle: interpolateVariables(variables.pushTitle || template.pushTitle || template.title, variables),
        pushBody: interpolateVariables(variables.pushBody || template.pushBody || template.body, variables),
        data: variables,
    };
}
