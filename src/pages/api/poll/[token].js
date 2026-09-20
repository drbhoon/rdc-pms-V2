/**
 * GET  /api/poll/:token — the ballot for one person
 * POST /api/poll/:token — cast it
 *
 * No login: the token IS the identity, as with the assessment forms. It also
 * decides the options — a question that votes for a person never offers the
 * holder of this token themselves.
 */
import { prisma } from '../../../lib/db';
import { effectiveStatus, optionsFor, pollIsOpen, validateAnswers } from '../../../lib/polls';

async function load(token) {
  const participant = await prisma.pollParticipant.findUnique({
    where: { token },
    include: {
      poll: {
        include: {
          questions: { orderBy: { order: 'asc' } },
          participants: { orderBy: { name: 'asc' } },
        },
      },
    },
  });
  return participant;
}

export default async function handler(req, res) {
  const { token } = req.query;
  const participant = await load(token);
  if (!participant) return res.status(404).json({ error: 'This voting link is not valid.' });
  const poll = participant.poll;

  if (req.method === 'GET') {
    return res.status(200).json({
      poll: {
        title: poll.title, description: poll.description,
        status: effectiveStatus(poll), closesAt: poll.closesAt,
      },
      voter: { name: participant.name, empCode: participant.empCode },
      alreadyVoted: !!participant.respondedOn,
      votedOn: participant.respondedOn,
      open: pollIsOpen(poll),
      questions: poll.questions.map((q) => ({
        id: q.id, text: q.text, type: q.type, required: q.required,
        maxChoices: q.maxChoices,
        options: optionsFor(q, poll.participants, participant.empCode),
      })),
      answers: participant.answers || null,
    });
  }

  if (req.method === 'POST') {
    if (!pollIsOpen(poll)) return res.status(400).json({ error: 'This poll is closed.' });
    // One vote each. Changing it would mean the result could move after
    // somebody had seen it, so a cast vote is final.
    if (participant.respondedOn) return res.status(409).json({ error: 'You have already voted in this poll.' });

    const checked = validateAnswers(poll.questions, poll.participants, participant.empCode, req.body?.answers);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    await prisma.pollParticipant.update({
      where: { id: participant.id },
      data: { answers: checked.answers, respondedOn: new Date() },
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
