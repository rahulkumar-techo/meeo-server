import { createSeedPrismaClient } from '../src/seed/seed-superadmin.js';
import { runSeed } from '../src/seed/seed.js';

createSeedPrismaClient()
  .then(async (prisma) => {
    try {
      await runSeed(prisma);
    } finally {
      await prisma.$disconnect();
    }
  })
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  });
