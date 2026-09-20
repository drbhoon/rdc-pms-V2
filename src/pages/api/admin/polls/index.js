/**
 * GET  /api/admin/polls — every poll, newest first, with its counts
 * POST /api/admin/polls — create one (title + questions; participants come next)
 */
import { requireAuth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { effectiveStatus, pollProgress } from '../../../../lib/polls';
import { normaliseQuestions } from '../../../../lib/pollInput';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const polls = await prisma.poll.findMany({
        orderBy: { createdAt: 'desc' },
        include: { questions: { orderBy: { order: 'asc' } }, participants: true },
      });
      return res.status(200).json({
        polls: polls.map((p) => ({
          id: p.id, title: p.title, description: p.description,
          status: effectiveStatus(p), rawStatus: p.status, closesAt: p.closesAt,
          createdBy: p.createdBy, createdAt: p.createdAt,
          questionCount: p.questions.length, ...pollProgress(p),
        })),
      });
    } catch (err) {
      console.error('[polls GET]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const { title, description, closesAt, questions } = req.body || {};
    if (!String(title || '').trim()) return res.status(400).json({ error: 'A title is required.' });
    const parsed = normaliseQuestions(questions, { allowEmpty: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    try {
      const poll = await prisma.poll.create({
        data: {
          title: String(title).trim(),
          description: String(description || '').trim() || null,
          closesAt: closesAt ? new Date(closesAt) : null,
          createdBy: user.email,
          questions: { create: parsed.questions },
        },
        include: { questions: true },
      });
      return res.status(201).json({ poll });
    } catch (err) {
      console.error('[polls POST]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
