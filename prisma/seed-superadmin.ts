import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Fix updatedAt default on roles table (safe to run multiple times)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "roles" ALTER COLUMN "updatedAt" SET DEFAULT now()`
  );

  // 2. Create all permissions
  const permissionNames = [
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

  for (const name of permissionNames) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} permission` },
    });
  }
  console.log(`✅ ${permissionNames.length} permissions created/verified`);

  // 3. Create SUPER_ADMIN role
  const role = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: { name: 'SUPER_ADMIN', description: 'Unrestricted access to every resource' },
  });
  console.log(`✅ Role SUPER_ADMIN: ${role.id}`);

  // 4. Assign all permissions to SUPER_ADMIN
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
  }
  console.log(`✅ All ${allPerms.length} permissions assigned to SUPER_ADMIN`);

  // 5. Assign SUPER_ADMIN role to the user
  const email = process.env.ADMIN_EMAIL;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`❌ User not found: ${email}`);
    console.log('Make sure the user has registered first.');
    return;
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`✅ SUPER_ADMIN role assigned to ${user.email}`);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
