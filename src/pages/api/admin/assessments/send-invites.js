/**
 * POST /api/admin/assessments/send-invites
 * Manual trigger for HR — runs the same invite logic as the daily cron so
 * HR can blast emails immediately after launching a cycle (instead of
 * waiting for the next cron tick).
 */
import { requireAuth } from '../../../../lib/auth';
import { runInvites } from '../../../../lib/invites';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const result = await runInvites();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin/send-invites]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
