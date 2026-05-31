/**
 * /api/cron/invites-and-reminders
 *
 * Public endpoint hit by an external scheduler (cron-job.org) — NOT by users.
 *
 * Auth: the caller must present the CRON_SECRET either
 *   - via header `x-cron-secret: <secret>`, or
 *   - via query `?secret=<secret>`
 * If CRON_SECRET is unset, the endpoint refuses all calls.
 *
 * Behaviour:
 *   - ALWAYS triggers runInvites() — picks up pairs whose startOn has been
 *     reached and have not yet been invited. Idempotent.
 *   - ONLY triggers runReminders() when the request arrives in the
 *     midnight-IST window (00:00 IST ± 15 min = 18:15–18:45 UTC), or
 *     when `?force=1` is passed.
 *
 * Response mode (default — recommended for cron-job.org):
 *   The endpoint returns 200 within a few milliseconds with `{accepted: true}`.
 *   runInvites/runReminders run in the BACKGROUND (Railway keeps the Node
 *   process alive after the response so async work completes). This avoids
 *   cron-job.org's 30s client timeout when reminders take longer.
 *
 *   Pass `?wait=1` to get the legacy synchronous behaviour — handler awaits
 *   all work and returns the full result. Useful for manual `curl` testing.
 *
 * GET and POST both accepted.
 */
import { runInvites, runReminders, isMidnightIstWindow } from '../../../lib/invites';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET not configured' });

  const provided = req.headers['x-cron-secret'] || req.query.secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const force = req.query.force === '1' || req.query.force === 'true';
  const wait  = req.query.wait  === '1' || req.query.wait  === 'true';
  const runReminderNow = force || isMidnightIstWindow();
  const ranAt = new Date().toISOString();

  // ── Synchronous mode (manual testing) ──────────────────────────────────
  if (wait) {
    const out = { ranAt, mode: 'sync' };
    try {
      out.invites = await runInvites();
    } catch (e) {
      out.invitesError = e.message;
    }
    if (runReminderNow) {
      try {
        out.reminders = await runReminders();
      } catch (e) {
        out.remindersError = e.message;
      }
    } else {
      out.reminders = 'skipped (outside midnight-IST window)';
    }
    return res.status(200).json(out);
  }

  // ── Default: background mode ───────────────────────────────────────────
  // Fire-and-forget so cron-job.org gets an instant 200, even when
  // runReminders has 100+ pairs to email through slow SMTP. Errors are
  // logged to Railway logs; per-email success/failure is in the AuditLog
  // (INVITE_SENT / INVITE_FAILED rows).
  const workInBackground = async () => {
    try {
      const inv = await runInvites();
      console.log('[cron bg] invites:', JSON.stringify(inv));
    } catch (e) {
      console.error('[cron bg] invites failed:', e.message);
    }
    if (runReminderNow) {
      try {
        const rem = await runReminders();
        console.log('[cron bg] reminders:', JSON.stringify(rem));
      } catch (e) {
        console.error('[cron bg] reminders failed:', e.message);
      }
    } else {
      console.log('[cron bg] reminders skipped (outside midnight-IST window)');
    }
  };
  workInBackground().catch((e) => console.error('[cron bg] unexpected:', e));

  return res.status(202).json({
    accepted: true,
    ranAt,
    mode: 'background',
    runReminders: runReminderNow,
    note: 'Work running asynchronously. Check Audit log for INVITE_SENT rows.',
  });
}
