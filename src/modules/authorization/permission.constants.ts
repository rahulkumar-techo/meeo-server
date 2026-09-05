// Canonical capabilities used by route guards and RBAC provisioning.
export const PERMISSIONS = {
    PRODUCT_READ: "product:read",
    PRODUCT_CREATE: "product:create",
    PRODUCT_UPDATE: "product:update",
    PRODUCT_DELETE: "product:delete",

    ORDER_READ: "order:read",
    ORDER_UPDATE: "order:update",
    ORDER_CANCEL: "order:cancel",

    INVENTORY_READ: "inventory:read",
    INVENTORY_UPDATE: "inventory:update",

    PAYMENT_READ: "payment:read",
    PAYMENT_REFUND: "payment:refund",

    USER_READ: "user:read",
    USER_UPDATE: "user:update",

    ROLE_READ: "role:read",
    ROLE_CREATE: "role:create",
    ROLE_UPDATE: "role:update",
    ROLE_DELETE: "role:delete",

    AUDIT_READ: "audit:read",
    SYSTEM_MANAGE: "system:manage",
} as const;
