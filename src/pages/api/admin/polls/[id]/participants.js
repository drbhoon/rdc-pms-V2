/**
 * PUT /api/admin/polls/:id/participants — set who votes, from the employee master.
 *
 * Employee codes in, names and e-mail addresses resolved here from the master:
 * the browser never decides who an address belongs to, the same rule the
 * assessment launch follows.
 *
 * Re-running it adds and removes people. Anyone who has already voted is kept
 * whatever the new list says — removing them would throw away a cast vote.
 */
import { requireAuth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { fetchMasterEmployees, masterConfigured } from '../../../../../lib/master';
import { MAX_PARTICIPANTS } from '../../../../../lib/polls';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const codes = [...new Set((Array.isArray(req.body?.empCodes) ? req.body.empCodes : []).map((c) => String(c).trim()).filter(Boolean))];
  if (!codes.length) return res.status(400).json({ error: 'Pick at least one participant.' });
  if (codes.length > MAX_PARTICIPANTS) return res.status(400).json({ error: `A poll can have at most ${MAX_PARTICIPANTS} participants.` });
  if (!masterConfigured()) return res.status(503).json({ error: 'The employee master is not configured for this deployment.' });

  const poll = await prisma.poll.findUnique({ where: { id }, include: { participants: true } });
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  try {
    const master = await fetchMasterEmployees({ picker: true });
    const byCode = new Map(master.map((e) => [String(e.employee_code), e]));

    const wanted = [];
    const missing = [];
    const noEmail = [];
    for (const code of codes) {
      const person = byCode.get(code);
      if (!person) { missing.push(code); continue; }
      const email = String(person.official_email_id || '').trim().toLowerCase();
      if (!email) { noEmail.push(`${person.employee_name} (${code})`); continue; }
      wanted.push({ empCode: code, name: person.employee_name || code, email });
    }
    // Refused whole rather than quietly skipping: a poll missing four of the
    // forty people it was supposed to reach looks exactly like one that worked.
    if (missing.length || noEmail.length) {
      const parts = [];
      if (missing.length) parts.push(`${missing.length} not in the employee master (${missing.slice(0, 5).join(', ')})`);
      if (noEmail.length) parts.push(`${noEmail.length} with no e-mail on file (${noEmail.slice(0, 5).join(', ')})`);
      return res.status(400).json({ error: `Cannot add: ${parts.join('; ')}.` });
    }

    const keep = new Set(wanted.map((w) => w.empCode));
    const voted = poll.participants.filter((p) => p.respondedOn);
    const dropped = poll.participants.filter((p) => !keep.has(p.empCode) && !p.respondedOn);

    await prisma.$transaction([
      ...(dropped.length ? [prisma.pollParticipant.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } })] : []),
      ...wanted.map((w) => prisma.pollParticipant.upsert({
        where: { pollId_empCode: { pollId: id, empCode: w.empCode } },
        update: { name: w.name, email: w.email },
        create: { pollId: id, empCode: w.empCode, name: w.name, email: w.email },
      })),
    ]);

    const participants = await prisma.pollParticipant.findMany({ where: { pollId: id }, orderBy: { name: 'asc' } });
    const keptVoters = voted.filter((v) => !keep.has(v.empCode)).length;
    return res.status(200).json({
      participants,
      removed: dropped.length,
      keptVoters,
      message: keptVoters
        ? `${participants.length} participant(s). ${keptVoters} who had already voted were kept.`
        : `${participants.length} participant(s).`,
    });
  } catch (err) {
    console.error('[poll participants PUT]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
