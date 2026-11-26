import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PERMISSIONS } from '../src/modules/authorization/permission.constants.js';

const DEFAULT_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim() || 'admin123@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD?.trim() || 'admin@123';

export async function createSeedPrismaClient(): Promise<PrismaClient> {
  const rawUrl = process.env.SEED_DATABASE_URL?.trim() || process.env.DATABASE_URL!;
  const primaryAdapter = new PrismaPg({ connectionString: rawUrl });
  const primaryClient = new PrismaClient({ adapter: primaryAdapter });

  try {
    await primaryClient.$queryRaw`SELECT 1`;
    return primaryClient;
  } catch (err: any) {
    const isDockerHost = rawUrl.includes('host.docker.internal');
    if (!isDockerHost) throw err;

    await primaryClient.$disconnect().catch(() => null);
    const localUrl = new URL(rawUrl);
    localUrl.hostname = 'localhost';
    console.log('ℹ️ host.docker.internal unreachable/denied from host, retrying with localhost...');
    const localAdapter = new PrismaPg({ connectionString: localUrl.toString() });
    return new PrismaClient({ adapter: localAdapter });
  }
}

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

export async function seedRbacAndSuperAdmin(prisma: PrismaClient) {
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

  // 6. Create or update default credentials SuperAdmin user (fallback when not using Google Auth)
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  const passwordHash = await argon2.hash(DEFAULT_ADMIN_PASSWORD);

  const superAdminUser = await prisma.user.upsert({
    where: { email: DEFAULT_ADMIN_EMAIL },
    update: {
      passwordHash,
      emailVerified: true,
      status: 'ACTIVE',
      deletedAt: null,
      firstName: 'Super',
      lastName: 'Admin',
    },
    create: {
      email: DEFAULT_ADMIN_EMAIL,
      passwordHash,
      emailVerified: true,
      status: 'ACTIVE',
      firstName: 'Super',
      lastName: 'Admin',
    },
  });

  await prisma.authAccount.upsert({
    where: {
      userId_provider_unique: {
        userId: superAdminUser.id,
        provider: 'PASSWORD',
      },
    },
    update: {
      providerAccountId: DEFAULT_ADMIN_EMAIL,
      passwordHash,
    },
    create: {
      userId: superAdminUser.id,
      provider: 'PASSWORD',
      providerAccountId: DEFAULT_ADMIN_EMAIL,
      passwordHash,
    },
  });

  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superAdminUser.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: superAdminUser.id, roleId: superAdminRole.id },
    });
    console.log(`👑 SUPER_ADMIN credentials user ready (${DEFAULT_ADMIN_EMAIL})`);
  }

  // 7. Also assign SUPER_ADMIN role to optional ADMIN_EMAIL (e.g. Google Auth admin) if registered
  const envAdminEmail = process.env.ADMIN_EMAIL?.trim();
  if (envAdminEmail && envAdminEmail.toLowerCase() !== DEFAULT_ADMIN_EMAIL.toLowerCase()) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: envAdminEmail, mode: 'insensitive' } },
    });
    if (user && superAdminRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
        update: {},
        create: { userId: user.id, roleId: superAdminRole.id },
      });
      console.log(`👑 SUPER_ADMIN role assigned to configured admin (${user.email})`);
    } else {
      console.log(`ℹ️ Optional ADMIN_EMAIL (${envAdminEmail}) not yet registered in database.`);
    }
  }

  console.log('\n🎉 RBAC & RAG Permission Seed completed successfully!');
  return superAdminUser;
}

const isDirectRun =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  createSeedPrismaClient()
    .then(async (prisma) => {
      try {
        await seedRbacAndSuperAdmin(prisma);
      } finally {
        await prisma.$disconnect();
      }
    })
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    });
}
