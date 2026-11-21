/**
 * Runs once when the Next.js server starts. Starts PARAKH's own scheduler
 * (see lib/scheduler.js) where IN_APP_SCHEDULER=true — hr.rdcc.ai, which has
 * no external cron.
 *
 * The import must stay INSIDE the NEXT_RUNTIME check: Next also builds this
 * file for the middleware's edge runtime, and only this exact shape lets it
 * drop the Node-only code (Prisma, nodemailer) from that build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.IN_APP_SCHEDULER === 'true') {
      const { startScheduler } = await import('./lib/scheduler');
      startScheduler();
    }
  }
}
