/**
 * completion.js — tell HR when an assessment is completed.
 *
 * When a pair reaches FINALIZED, two people get an e-mail: the HR SPOC named
 * for that employee (the HR-SPOC stage's reviewer, or the template's default
 * HR SPOC), and the HR person who launched it. If they are the same person
 * they get one e-mail. Each send is written to the audit log.
 *
 * Called by every submit that can finalise a pair (Self on a feedback
 * template, RM without a BH, BH, and the last HR commenter). It checks the
 * status itself, so callers just call it after saving; it never throws, so a
 * mail problem can never undo or fail the submission that finished the pair.
 */
import { getPairWithReviews, getRole, appendAudit } from './queries';
import { sendCompletionNotice } from './mailer';
import { appBaseUrl } from './invites';

const looksLikeEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || '').trim());

/** Who should hear that this pair is complete: [{ email, name, why }], deduplicated. */
export function completionRecipients(pair, role) {
  const out = [];
  const add = (email, name, why) => {
    const e = String(email || '').trim().toLowerCase();
    if (!looksLikeEmail(e)) return;
    const existing = out.find((r) => r.email === e);
    if (existing) { if (!existing.why.includes(why)) existing.why.push(why); return; }
    out.push({ email: e, name: String(name || '').trim() || e, why: [why] });
  };
  const spoc = (pair.hrReviews || []).find((r) => r.role === 'HR_SPOC');
  add(spoc?.email || role?.hrSpocEmail, spoc?.name || role?.hrSpocName, 'HR_SPOC');
  // selectedBy is the launching HR admin's e-mail (SSO on hr.rdcc.ai).
  add(pair.selectedBy, '', 'LAUNCHED_BY');
  return out;
}

export async function notifyIfCompleted(pairId) {
  try {
    const pair = await getPairWithReviews(pairId);
    if (!pair || pair.status !== 'FINALIZED') return { sent: 0 };

    const role = await getRole(pair.roleKey);
    const recipients = completionRecipients(pair, role);
    if (recipients.length === 0) return { sent: 0 };

    const base = appBaseUrl();
    const reviewers = [
      ['Level 1 (RM)', pair.rmName],
      ['Level 2 (BH)', pair.bhName],
    ];
    let sent = 0;
    for (const r of recipients) {
      const result = await sendCompletionNotice({
        to: r.email,
        name: r.name,
        empName: pair.empName,
        empCode: pair.empCode,
        roleLabel: role?.roleLabel || pair.roleKey,
        cycle: pair.cycle,
        completedOn: pair.lastUpdatedOn,
        reviewers,
        reportUrl: base ? `${base}/admin/reports` : '',
      });
      if (result?.ok) sent += 1;
      await appendAudit({
        action: result?.ok ? 'COMPLETION_NOTICE_SENT' : 'COMPLETION_NOTICE_FAILED',
        pairId: pair.pairId, empCode: pair.empCode, empName: pair.empName,
        roleKey: pair.roleKey, cycle: pair.cycle, performedBy: 'system',
        details: { to: r.email, as: r.why, ...(result?.ok ? {} : { error: result?.error || (result?.skipped ? 'SMTP not configured' : 'unknown') }) },
      }).catch(() => {});
    }
    return { sent };
  } catch (e) {
    console.error('[completion] notice failed for', pairId, e.message);
    return { sent: 0, error: e.message };
  }
}
