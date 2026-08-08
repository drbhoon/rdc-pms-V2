/**
 * POST /api/admin/pairs/create
 * Creates a single assessment pair. Requires HR admin session.
 *
 * All the rules — FEEDBACK vs STANDARD/OJT, self-assessment e-mail capture,
 * which post-BH commenter stages are active — live in lib/launchPair.js, which
 * the batch launch from the employee master also uses. One implementation, so
 * the two paths cannot drift apart.
 *
 * Email is NOT sent from here. The cron endpoint and Cycle Management's
 * auto-fire path both call runInvites(), which discovers pending pairs and
 * sends one batch email per reviewer.
 */
import { requireAuth } from '../../../../lib/auth';
import { getRole } from '../../../../lib/queries';
import { launchPair, LaunchError } from '../../../../lib/launchPair';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const {
    empCode, empName, roleKey, cycle,
    rmName, rmEmail, bhName, bhEmail,
    startOn,
  } = req.body || {};

  if (!empCode || !empName || !roleKey || !cycle) {
    return res.status(400).json({ error: 'empCode, empName, roleKey, cycle are all required' });
  }

  try {
    const role = await getRole(roleKey);
    if (!role) return res.status(400).json({ error: `No template found for role "${roleKey}".` });

    const pair = await launchPair({
      empCode, empName, roleKey, cycle,
      rmName, rmEmail, bhName, bhEmail,
      startOn, selectedBy: user.email, role,
    });

    return res.status(201).json({ pair });
  } catch (err) {
    // LaunchError messages are written for HR and are safe to show.
    if (err instanceof LaunchError) return res.status(400).json({ error: err.message });
    console.error('[pairs/create]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
