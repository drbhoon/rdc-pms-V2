/**
 * The poll result workbook — the Google-Forms-style download.
 *
 * Three sheets, because three different questions get asked of a result:
 *   Summary   — who won, with the vote count and share per option.
 *   Responses — one row per voter, one column per question. Votes are not
 *               secret in this tool, so the names are here by design.
 *   Not Voted — who still has not, which is what a reminder is drawn from.
 */
import * as XLSX from 'xlsx';
import { effectiveStatus, labelForValue, pollProgress, tally } from './polls';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');

export function buildPollWorkbook(poll) {
  const participants = poll.participants || [];
  const questions = poll.questions || [];
  const results = tally(poll);
  const progress = pollProgress(poll);
  const wb = XLSX.utils.book_new();

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = [
    ['Poll', poll.title],
    ['Status', effectiveStatus(poll)],
    ['Closes', fmt(poll.closesAt) || 'when closed by hand'],
    ['Invited', progress.invited],
    ['Voted', progress.responded],
    ['Not voted', progress.pending],
    [],
  ];
  results.forEach((r, i) => {
    summary.push([`Q${i + 1}. ${r.question.text}`]);
    if (r.kind === 'text') {
      summary.push(['Answer', 'Voter']);
      r.answers.forEach((a) => summary.push([a.text, `${a.name} (${a.empCode})`]));
    } else {
      summary.push(['Option', 'Votes', 'Share', 'Voted by']);
      r.rows.forEach((row) => summary.push([
        row.label,
        row.votes,
        r.total ? `${Math.round((row.votes / r.total) * 1000) / 10}%` : '0%',
        row.voters.join(', '),
      ]));
    }
    summary.push([]);
  });
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = [{ wch: 46 }, { wch: 12 }, { wch: 10 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // ── Responses ─────────────────────────────────────────────────────────────
  const header = ['Sr No', 'Emp Code', 'Name', 'Email', 'Voted On', ...questions.map((q, i) => `Q${i + 1}. ${q.text}`)];
  const rows = participants
    .filter((p) => p.respondedOn)
    .map((p, i) => [
      i + 1, p.empCode, p.name, p.email, fmt(p.respondedOn),
      ...questions.map((q) => {
        const raw = p.answers?.[q.id];
        const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
        return values.map((v) => labelForValue(q, v, participants)).join('; ');
      }),
    ]);
  const responseSheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  responseSheet['!cols'] = header.map((h, i) => (i < 5 ? { wch: [7, 14, 26, 30, 20][i] } : { wch: 34 }));
  responseSheet['!freeze'] = { xSplit: 3, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, responseSheet, 'Responses');

  // ── Not voted ─────────────────────────────────────────────────────────────
  const pending = participants.filter((p) => !p.respondedOn);
  const pendingSheet = XLSX.utils.aoa_to_sheet([
    ['Sr No', 'Emp Code', 'Name', 'Email', 'Invited On'],
    ...pending.map((p, i) => [i + 1, p.empCode, p.name, p.email, fmt(p.invitedOn)]),
  ]);
  pendingSheet['!cols'] = [{ wch: 7 }, { wch: 14 }, { wch: 26 }, { wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, pendingSheet, 'Not Voted');

  return wb;
}

export function pollFilename(poll) {
  const safe = String(poll.title || 'poll').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `poll-${safe || 'results'}.xlsx`;
}
