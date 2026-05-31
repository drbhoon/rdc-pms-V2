/**
 * POST /api/admin/pairs/resend-invite
 * Body: { pairId }
 *
 * Force-resends the next-step invite for one specific pair, regardless of
 * the `*InvitedOn` stamp (so HR has a manual override when an email got
 * lost). Picks the right reviewer based on current status:
 *   PENDING_SELF → re-email the employee
 *   PENDING_RM   → re-email the RM
 *   RM_SUBMITTED → re-email the BH
 *   FINALIZED    → 400 (nothing to invite)
 *
 * Writes audit (INVITE_SENT / INVITE_FAILED) just like the cron path.
 */
import { requireAuth } from '../../../../lib/auth';
import {
  getPairById,
  getRole,
  getOrCreateReviewerLink,
  appendAudit,
} from '../../../../lib/queries';
import { sendReviewerBatch } from '../../../../lib/mailer';

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { pairId } = req.body || {};
  if (!pairId) return res.status(400).json({ error: 'pairId is required' });

  try {
    const pair = await getPairById(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair not found' });

    // Decide which reviewer to ping based on current status.
    let role, recipient, name;
    if (pair.status === 'PENDING_SELF' && pair.requireSelf && pair.selfEmail) {
      role = 'SELF'; recipient = pair.selfEmail; name = pair.selfName || pair.empName;
    } else if (pair.status === 'PENDING_RM') {
      role = 'RM'; recipient = pair.rmEmail; name = pair.rmName;
    } else if (pair.status === 'RM_SUBMITTED') {
      role = 'BH'; recipient = pair.bhEmail; name = pair.bhName;
    } else if (pair.status === 'FINALIZED') {
      return res.status(400).json({ error: 'Pair is finalised — no invite to send' });
    } else {
      return res.status(400).json({ error: `Unsupported status: ${pair.status}` });
    }

    if (!recipient) {
      return res.status(400).json({ error: `No ${role} email on file for this pair` });
    }

    const role_template = await getRole(pair.roleKey);
    const link = await getOrCreateReviewerLink(recipient, role, pair.roleKey, pair.cycle);
    const dashboardUrl = `${appUrl()}/reviewer/${link.token}`;

    // Send (mailer handles its own audit + retry)
    await sendReviewerBatch({
      to:           recipient,
      name,
      role,
      roleLabel:    role_template?.roleLabel || pair.roleKey,
      cycle:        pair.cycle,
      pairs:        [pair],
      dashboardUrl,
      isReminder:   false,
    });

    // Audit the manual resend trigger separately so HR sees who clicked it.
    await appendAudit({
      action:      'INVITE_RESENT',
      pairId:      pair.pairId,
      empCode:     pair.empCode,
      empName:     pair.empName,
      roleKey:     pair.roleKey,
      cycle:       pair.cycle,
      performedBy: user.email,
      details:     { role, to: recipient, status: pair.status },
    });

    return res.status(200).json({
      ok:        true,
      role,
      recipient,
      message:   `${role} invite resent to ${recipient}`,
    });
  } catch (err) {
    console.error('[pairs/resend-invite]', err);
    return res.status(500).json({ error: err.message || 'Resend failed' });
  }
}
