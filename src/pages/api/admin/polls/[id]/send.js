/**
 * POST /api/admin/polls/:id/send — e-mail the voting links.
 *
 * Body { reminder: true } sends only to people who have not voted; otherwise
 * everyone who has not been invited yet gets their link. Sending is slow
 * (one SMTP round trip each, up to a hundred), so it runs in batches and
 * reports what happened per address rather than failing the whole call.
 */
import { requireAuth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { sendPollInvite } from '../../../../../lib/mailer';
import { pollIsOpen } from '../../../../../lib/polls';
import { appBaseUrl } from '../../../../../lib/invites';

const BATCH = 5;

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const reminder = !!req.body?.reminder;
  const poll = await prisma.poll.findUnique({ where: { id }, include: { participants: true } });
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (!pollIsOpen(poll)) return res.status(400).json({ error: 'Open the poll before sending the links.' });

  const targets = poll.participants.filter((p) => (reminder ? !p.respondedOn : !p.invitedOn));
  if (!targets.length) {
    return res.status(200).json({ sent: 0, failed: 0, message: reminder ? 'Everyone has voted.' : 'Everyone has already been invited.' });
  }

  const base = appBaseUrl();
  let sent = 0;
  const failures = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    await Promise.all(slice.map(async (p) => {
      try {
        const result = await sendPollInvite({
          name: p.name, email: p.email, pollTitle: poll.title, description: poll.description,
          closesAt: poll.closesAt, voteUrl: `${base}/poll/${p.token}`, isReminder: reminder,
        });
        if (result?.ok === false && !result.skipped) throw new Error(result.error || 'send failed');
        if (result?.skipped) throw new Error('SMTP is not configured');
        sent += 1;
        await prisma.pollParticipant.update({ where: { id: p.id }, data: { invitedOn: new Date() } });
      } catch (err) {
        failures.push(`${p.email}: ${err.message || 'failed'}`);
      }
    }));
  }

  return res.status(200).json({
    sent, failed: failures.length, failures: failures.slice(0, 10),
    message: `${sent} ${reminder ? 'reminder' : 'invitation'}(s) sent${failures.length ? `, ${failures.length} failed` : ''}.`,
  });
}
