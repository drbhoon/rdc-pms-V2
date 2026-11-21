/**
 * scheduler.js — PARAKH's own clock, for deployments with no external cron.
 *
 * On Railway an external scheduler (cron-job.org) calls
 * /api/cron/invites-and-reminders. hr.rdcc.ai has no such caller, so there
 * nothing ever sent a reminder, and a launch dated for later was only e-mailed
 * when someone happened to press "Send Invites Now". This does the same job
 * from inside the app:
 *
 *   every 5 minutes  runInvites()   — first e-mails, including launches whose
 *                                     Start-on date has now arrived
 *   once a night     runReminders() — the midnight-IST reminders, to everyone
 *                                     still pending (Self, RM, BH, HR-SPOC,
 *                                     HR-HEAD, COTO)
 *
 * Switched on only where IN_APP_SCHEDULER=true (hr.rdcc.ai), so a deployment
 * that already has the external cron does not send everything twice.
 *
 * The nightly run is recorded as a REMINDERS_RUN row in the audit log, written
 * BEFORE the e-mails go out: a restart inside the midnight window, or a second
 * tick, sees the row and does not send a second round.
 */
import { prisma } from './db';
import { runInvites, runReminders, isMidnightIstWindow } from './invites';

const TICK_MS = 5 * 60 * 1000;
let started = false;
let busy = false;

const anythingSent = (result) =>
  Object.entries(result || {}).some(([k, v]) => k !== 'errors' && typeof v === 'number' && v > 0)
  || (result?.errors || []).length > 0;

/** One pass of the clock. `now` is only passed by tests. */
export async function schedulerTick(now = new Date()) {
  if (busy) return;   // a slow SMTP run must not overlap the next tick
  busy = true;
  try {
    const invites = await runInvites();
    if (anythingSent(invites)) console.log('[scheduler] invites:', JSON.stringify(invites));

    if (isMidnightIstWindow(now)) {
      const recent = await prisma.auditLog.findFirst({
        where: { action: 'REMINDERS_RUN', timestamp: { gte: new Date(now.getTime() - 6 * 3600 * 1000) } },
        select: { id: true },
      });
      if (!recent) {
        const marker = await prisma.auditLog.create({
          data: { action: 'REMINDERS_RUN', performedBy: 'scheduler', details: { startedAt: new Date().toISOString() } },
        });
        const reminders = await runReminders();
        console.log('[scheduler] reminders:', JSON.stringify(reminders));
        await prisma.auditLog.update({
          where: { id: marker.id },
          data: { details: { startedAt: marker.details?.startedAt, finishedAt: new Date().toISOString(), ...reminders } },
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[scheduler] tick failed:', e.message);
  } finally {
    busy = false;
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  // First tick a minute after start, once the server is up and the database
  // schema has been pushed; then every five minutes.
  setTimeout(() => schedulerTick(), 60 * 1000);
  setInterval(() => schedulerTick(), TICK_MS);
  console.log('[scheduler] on: invites every 5 min, reminders nightly at 00:00 IST');
}
