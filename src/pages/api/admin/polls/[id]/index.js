/**
 * GET    /api/admin/polls/:id  — the poll, its participants and the live tally
 * PATCH  /api/admin/polls/:id  — edit it, or open / close it
 * DELETE /api/admin/polls/:id  — remove it (and its votes)
 *
 * Editing questions is refused once voting has started: the answers already
 * cast are filed under the question ids, so changing them underneath would
 * silently re-interpret somebody's vote.
 */
import { requireAuth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { effectiveStatus, pollProgress, tally } from '../../../../../lib/polls';
import { normaliseQuestions } from '../../../../../lib/pollInput';

const FULL = {
  questions: { orderBy: { order: 'asc' } },
  participants: { orderBy: { name: 'asc' } },
};

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const poll = await prisma.poll.findUnique({ where: { id }, include: FULL });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    return res.status(200).json({
      poll: { ...poll, status: effectiveStatus(poll), rawStatus: poll.status },
      progress: pollProgress(poll),
      results: tally(poll),
    });
  }

  if (req.method === 'PATCH') {
    const poll = await prisma.poll.findUnique({ where: { id }, include: FULL });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const { title, description, closesAt, questions, action } = req.body || {};
    const voted = poll.participants.filter((p) => p.respondedOn).length;

    try {
      if (action === 'open') {
        if (!poll.questions.length) return res.status(400).json({ error: 'Add a question before opening.' });
        if (!poll.participants.length) return res.status(400).json({ error: 'Add participants before opening.' });
        await prisma.poll.update({ where: { id }, data: { status: 'OPEN' } });
        return res.status(200).json({ ok: true, status: 'OPEN' });
      }
      if (action === 'close') {
        await prisma.poll.update({ where: { id }, data: { status: 'CLOSED' } });
        return res.status(200).json({ ok: true, status: 'CLOSED' });
      }

      const data = {};
      if (title !== undefined) data.title = String(title).trim();
      if (description !== undefined) data.description = String(description || '').trim() || null;
      if (closesAt !== undefined) data.closesAt = closesAt ? new Date(closesAt) : null;

      if (questions !== undefined) {
        if (voted > 0) {
          return res.status(409).json({
            error: `${voted} vote(s) are already in, so the questions can no longer change. Close this poll and create another one.`,
          });
        }
        const parsed = normaliseQuestions(questions);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        await prisma.pollQuestion.deleteMany({ where: { pollId: id } });
        data.questions = { create: parsed.questions };
      }

      const updated = await prisma.poll.update({ where: { id }, data, include: FULL });
      return res.status(200).json({ poll: updated });
    } catch (err) {
      console.error('[poll PATCH]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.poll.delete({ where: { id } });
      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err?.code === 'P2025') return res.status(404).json({ error: 'Poll not found' });
      console.error('[poll DELETE]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
