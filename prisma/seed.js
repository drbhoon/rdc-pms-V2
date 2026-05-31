/**
 * prisma/seed.js
 * Creates the initial HR Super Admin user.
 * Run: node prisma/seed.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.SEED_ADMIN_EMAIL    || 'admin@rdcconcrete.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@1234';
  const name     = process.env.SEED_ADMIN_NAME     || 'HR Super Admin';

  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.hrUser.upsert({
    where:  { email },
    update: { password: hash, name },
    create: { email, name, role: 'HR_SUPER_ADMIN', password: hash },
  });

  console.log(`\n✅ Super Admin created/updated:`);
  console.log(`   Email   : ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role    : ${user.role}`);
  console.log(`\n   Change the password after first login!\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
