/**
 * POST /api/admin/seed
 * One-time endpoint to seed the Super Admin user.
 * Protected by SEED_SECRET env var.
 * Call once after first deploy: POST /api/admin/seed  { secret: "..." }
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = req.body?.secret;
  const expectedSecret = process.env.SEED_SECRET;

  if (!expectedSecret) {
    return res.status(503).json({ error: 'SEED_SECRET not configured on Railway' });
  }
  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  const email    = process.env.SEED_ADMIN_EMAIL    || 'admin@rdcconcrete.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@1234';
  const name     = process.env.SEED_ADMIN_NAME     || 'HR Super Admin';

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.hrUser.upsert({
      where:  { email },
      update: { password: hash, name },
      create: { email, name, role: 'HR_SUPER_ADMIN', password: hash },
    });
    return res.json({
      ok: true,
      email: user.email,
      role: user.role,
      message: 'Super Admin seeded. Change the password after first login!',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    await prisma.$disconnect();
  }
}
