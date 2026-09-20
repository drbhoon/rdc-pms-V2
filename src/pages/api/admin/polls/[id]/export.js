/** GET /api/admin/polls/:id/export — the result workbook. */
import * as XLSX from 'xlsx';
import { requireAuth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { buildPollWorkbook, pollFilename } from '../../../../../lib/pollXlsx';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const poll = await prisma.poll.findUnique({
    where: { id: req.query.id },
    include: { questions: { orderBy: { order: 'asc' } }, participants: { orderBy: { name: 'asc' } } },
  });
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const buf = XLSX.write(buildPollWorkbook(poll), { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${pollFilename(poll)}"`);
  return res.status(200).send(buf);
}
