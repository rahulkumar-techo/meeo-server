import { createSeedPrismaClient, seedRbacAndSuperAdmin } from '../src/seed/seed-superadmin.js';

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
