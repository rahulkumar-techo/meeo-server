// Canonical capabilities used by route guards and RBAC provisioning.
export const PERMISSIONS = {
    PRODUCT_READ: "product:read",
    PRODUCT_CREATE: "product:create",
    PRODUCT_UPDATE: "product:update",
    PRODUCT_DELETE: "product:delete",

    CATEGORY_READ: "category:read",
    CATEGORY_CREATE: "category:create",
    CATEGORY_UPDATE: "category:update",
    CATEGORY_DELETE: "category:delete",

    BRAND_READ: "brand:read",
    BRAND_CREATE: "brand:create",
    BRAND_UPDATE: "brand:update",
    BRAND_DELETE: "brand:delete",

    ATTRIBUTE_READ: "attribute:read",
    ATTRIBUTE_CREATE: "attribute:create",
    ATTRIBUTE_UPDATE: "attribute:update",
    ATTRIBUTE_DELETE: "attribute:delete",

    ORDER_READ: "order:read",
    ORDER_UPDATE: "order:update",
    ORDER_CANCEL: "order:cancel",

    INVENTORY_READ: "inventory:read",
    INVENTORY_UPDATE: "inventory:update",

    PAYMENT_READ: "payment:read",
    PAYMENT_UPDATE: "payment:update",
    PAYMENT_REFUND: "payment:refund",

    USER_READ: "user:read",
    USER_UPDATE: "user:update",

    ROLE_READ: "role:read",
    ROLE_CREATE: "role:create",
    ROLE_UPDATE: "role:update",
    ROLE_DELETE: "role:delete",

    COUPON_READ: "coupon:read",
    COUPON_CREATE: "coupon:create",
    COUPON_UPDATE: "coupon:update",
    COUPON_DELETE: "coupon:delete",

    PROMOTION_READ: "promotion:read",
    PROMOTION_CREATE: "promotion:create",
    PROMOTION_UPDATE: "promotion:update",
    PROMOTION_DELETE: "promotion:delete",

    REVIEW_READ: "review:read",
    REVIEW_MODERATE: "review:moderate",
    REVIEW_DELETE: "review:delete",

    DASHBOARD_READ: "dashboard:read",

    AUDIT_READ: "audit:read",
    AUDIT_LOG_READ: "audit:read",
    SYSTEM_MANAGE: "system:manage",

    // User 360 & Analytics
    USER_360_VIEW: "user_360:view",
    USER_COMMERCE_VIEW: "user_commerce:view",
    USER_BEHAVIOR_VIEW: "user_behavior:view",
    USER_INSIGHTS_VIEW: "user_insights:view",
    USER_ACTIVITY_VIEW: "user_activity:view",

    // GST & Statutory Tax Management
    TAX_READ: "tax:read",
    TAX_MANAGE: "tax:manage",
    TAX_APPROVE: "tax:approve",

    // RAG AI Agent & Retrieval Permissions
    RAG_PRODUCTS_READ: "rag:products:read",
    RAG_ORDERS_READ_OWN: "rag:orders:read_own",
    RAG_ORDERS_READ_SELLER: "rag:orders:read_seller",
    RAG_ORDERS_READ_ALL: "rag:orders:read_all",
    RAG_CUSTOMERS_READ_OWN: "rag:customers:read_own",
    RAG_CUSTOMERS_READ_ALL: "rag:customers:read_all",
    RAG_ANALYTICS_READ_ALL: "rag:analytics:read_all",
    RAG_INTERNAL_READ: "rag:internal:read",
    RAG_KNOWLEDGE_MANAGE: "rag:knowledge:manage",
    RAG_PERMISSIONS_MANAGE: "rag:permissions:manage",
} as const;

