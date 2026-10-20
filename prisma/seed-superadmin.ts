import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PERMISSIONS } from '../src/modules/authorization/permission.constants.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Role to Permission Matrix based on the RAG Security Specification
const ROLE_DEFINITIONS: Record<
  string,
  {
    description: string;
    permissions: string[];
  }
> = {
  SUPER_ADMIN: {
    description: 'Unrestricted root administrator with access to all system and AI resources',
    permissions: ['*'], // Receives every permission in the database
  },
  ADMIN: {
    description: 'System administrator with full RAG management and operational capabilities',
    permissions: [
      // Standard administration capabilities
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.ROLE_READ,
      PERMISSIONS.ROLE_UPDATE,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.PRODUCT_READ,
      PERMISSIONS.PRODUCT_CREATE,
      PERMISSIONS.PRODUCT_UPDATE,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.BRAND_READ,
      PERMISSIONS.ORDER_READ,
      PERMISSIONS.ORDER_UPDATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.PAYMENT_READ,
      PERMISSIONS.TAX_READ,

      // Complete RAG Permissions for Admin (Yes & If granted in matrix)
      PERMISSIONS.RAG_PRODUCTS_READ,
      PERMISSIONS.RAG_ORDERS_READ_OWN,
      PERMISSIONS.RAG_ORDERS_READ_SELLER,
      PERMISSIONS.RAG_ORDERS_READ_ALL,
      PERMISSIONS.RAG_CUSTOMERS_READ_OWN,
      PERMISSIONS.RAG_CUSTOMERS_READ_ALL,
      PERMISSIONS.RAG_ANALYTICS_READ_ALL,
      PERMISSIONS.RAG_INTERNAL_READ,
      PERMISSIONS.RAG_KNOWLEDGE_MANAGE,
      PERMISSIONS.RAG_PERMISSIONS_MANAGE,
    ],
  },
  SELLER: {
    description: 'Merchant role with catalog management and seller-scoped RAG access',
    permissions: [
      // Standard merchant capabilities
      PERMISSIONS.PRODUCT_READ,
      PERMISSIONS.PRODUCT_CREATE,
      PERMISSIONS.PRODUCT_UPDATE,
      PERMISSIONS.ORDER_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.REVIEW_READ,

      // Seller RAG Permissions from Matrix:
      PERMISSIONS.RAG_PRODUCTS_READ,      // Yes
      PERMISSIONS.RAG_ORDERS_READ_OWN,     // Yes
      PERMISSIONS.RAG_ORDERS_READ_SELLER,  // Own seller
    ],
  },
  CUSTOMER: {
    description: 'Store customer role with self-service shopping and order RAG access',
    permissions: [
      // Standard customer capabilities
      PERMISSIONS.PRODUCT_READ,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.BRAND_READ,
      PERMISSIONS.REVIEW_READ,

      // Customer RAG Permissions from Matrix:
      PERMISSIONS.RAG_PRODUCTS_READ,      // Yes
      PERMISSIONS.RAG_ORDERS_READ_OWN,     // Yes
      PERMISSIONS.RAG_CUSTOMERS_READ_OWN,  // Yes
    ],
  },
};

async function main() {
  console.log('🚀 Starting RBAC & RAG Permission Seed...\n');

  // 1. Ensure updatedAt default on roles table
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "roles" ALTER COLUMN "updatedAt" SET DEFAULT now()`
  );

  // 2. Gather all permissions (all canonical constants + legacy aliases)
  const canonicalPermissions = Object.values(PERMISSIONS);
  const legacyPermissions = [
    'ALL',
    'users:read', 'users:write', 'users:delete',
    'orders:read', 'orders:write', 'orders:delete',
    'products:read', 'products:write', 'products:delete',
    'payments:read', 'payments:write',
    'roles:read', 'roles:write', 'roles:delete',
    'analytics:read',
    'promotions:read', 'promotions:write', 'promotions:delete',
    'reviews:read', 'reviews:write', 'reviews:delete',
    'settings:read', 'settings:write',
  ];

  const allDistinctPermissions = Array.from(
    new Set([...canonicalPermissions, ...legacyPermissions])
  );

  // 3. Bulk insert permissions into DB
  console.log(`📦 Inserting ${allDistinctPermissions.length} permissions (if not existing)...`);
  await prisma.permission.createMany({
    data: allDistinctPermissions.map((name) => ({
      name,
      description: name.startsWith('rag:')
        ? `RAG AI capability: ${name}`
        : `${name} permission`,
    })),
    skipDuplicates: true,
  });
  console.log(`✅ All ${allDistinctPermissions.length} permissions verified.\n`);

  // 4. Fetch all permission records for quick mapping
  const permissionMap = new Map<string, string>();
  const dbPermissions = await prisma.permission.findMany();
  for (const p of dbPermissions) {
    permissionMap.set(p.name, p.id);
  }

  // 5. Seed Roles and Link Permissions
  for (const [roleName, def] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: def.description },
      create: { name: roleName, description: def.description },
    });

    console.log(`👤 Role '${roleName}' (ID: ${role.id})`);

    // Determine target permission IDs for this role
    let targetPermissionIds: string[] = [];
    if (def.permissions.includes('*')) {
      targetPermissionIds = dbPermissions.map((p) => p.id);
    } else {
      targetPermissionIds = def.permissions
        .map((pName) => permissionMap.get(pName))
        .filter((id): id is string => Boolean(id));
    }

    // Bulk link permissions to role
    await prisma.rolePermission.createMany({
      data: targetPermissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });

    console.log(
      `   └── Assigned ${targetPermissionIds.length} permissions to ${roleName}`
    );
  }
  console.log('');

  // 6. Assign SUPER_ADMIN role to default admin user if configured
  const email = process.env.ADMIN_EMAIL?.trim();
  if (email) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (user) {
      const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
      if (superAdminRole) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
          update: {},
          create: { userId: user.id, roleId: superAdminRole.id },
        });
        console.log(`👑 SUPER_ADMIN role assigned to configured admin (${user.email})`);
      }
    } else {
      console.log(`ℹ️ Admin user (${email}) not yet registered in database.`);
    }
  }

  console.log('\n🎉 RBAC & RAG Permission Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
