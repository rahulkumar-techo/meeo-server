-- Provision the fixed RBAC vocabulary without an application seed script.
-- Deterministic UUIDs make this migration safe to re-run in a restored database.

INSERT INTO "permissions" ("id", "name", "description")
VALUES
  (md5('rbac.permission.product:read')::uuid, 'product:read', 'Read products'),
  (md5('rbac.permission.product:create')::uuid, 'product:create', 'Create products'),
  (md5('rbac.permission.product:update')::uuid, 'product:update', 'Update products'),
  (md5('rbac.permission.product:delete')::uuid, 'product:delete', 'Delete products'),
  (md5('rbac.permission.order:read')::uuid, 'order:read', 'Read orders'),
  (md5('rbac.permission.order:update')::uuid, 'order:update', 'Update orders'),
  (md5('rbac.permission.order:cancel')::uuid, 'order:cancel', 'Cancel orders'),
  (md5('rbac.permission.inventory:read')::uuid, 'inventory:read', 'Read inventory'),
  (md5('rbac.permission.inventory:update')::uuid, 'inventory:update', 'Update inventory'),
  (md5('rbac.permission.payment:read')::uuid, 'payment:read', 'Read payments'),
  (md5('rbac.permission.payment:refund')::uuid, 'payment:refund', 'Refund payments'),
  (md5('rbac.permission.user:read')::uuid, 'user:read', 'Read users'),
  (md5('rbac.permission.user:update')::uuid, 'user:update', 'Update users'),
  (md5('rbac.permission.role:read')::uuid, 'role:read', 'Read roles and permissions'),
  (md5('rbac.permission.role:create')::uuid, 'role:create', 'Create roles'),
  (md5('rbac.permission.role:update')::uuid, 'role:update', 'Update roles and permissions'),
  (md5('rbac.permission.role:delete')::uuid, 'role:delete', 'Delete roles'),
  (md5('rbac.permission.audit:read')::uuid, 'audit:read', 'Read audit logs'),
  (md5('rbac.permission.system:manage')::uuid, 'system:manage', 'Bypass normal permission checks')
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "roles" ("id", "name", "description", "updatedAt")
VALUES
  (md5('rbac.role.SUPER_ADMIN')::uuid, 'SUPER_ADMIN', 'SUPER ADMIN role', CURRENT_TIMESTAMP),
  (md5('rbac.role.ADMIN')::uuid, 'ADMIN', 'ADMIN role', CURRENT_TIMESTAMP),
  (md5('rbac.role.PRODUCT_MANAGER')::uuid, 'PRODUCT_MANAGER', 'PRODUCT MANAGER role', CURRENT_TIMESTAMP),
  (md5('rbac.role.ORDER_MANAGER')::uuid, 'ORDER_MANAGER', 'ORDER MANAGER role', CURRENT_TIMESTAMP),
  (md5('rbac.role.INVENTORY_MANAGER')::uuid, 'INVENTORY_MANAGER', 'INVENTORY MANAGER role', CURRENT_TIMESTAMP),
  (md5('rbac.role.CUSTOMER_SUPPORT')::uuid, 'CUSTOMER_SUPPORT', 'CUSTOMER SUPPORT role', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN (
  'user:read', 'user:update', 'role:read', 'role:update', 'audit:read'
)
WHERE r."name" = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN ('product:read', 'product:create', 'product:update')
WHERE r."name" = 'PRODUCT_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN ('order:read', 'order:update', 'order:cancel')
WHERE r."name" = 'ORDER_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN ('inventory:read', 'inventory:update', 'product:read')
WHERE r."name" = 'INVENTORY_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" IN ('order:read', 'user:read', 'user:update')
WHERE r."name" = 'CUSTOMER_SUPPORT'
ON CONFLICT DO NOTHING;
