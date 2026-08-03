/**
 * ojt.js — helpers for OJT (segmented) templates.
 *
 * In an OJT template each role answers its OWN questions:
 *   - Employee (Self): unprefixed columns
 *   - RM:              columns prefixed RM_<n>  (e.g. "RM_1. ...")
 *   - BH:              columns prefixed BH_<n>  (e.g. "BH_1. ...")
 * (RM_NAME / RM_EMAIL / BH_NAME / BH_EMAIL remain routing, never questions.)
 *
 * Audience is derived from the question key (which is the original column
 * header), so no extra persistence is strictly required — but setup also stamps
 * `audience` onto each question for clarity. These helpers read `audience` when
 * present and fall back to the key prefix otherwise.
 */

// Derive the audience of a question from its key/header prefix.
export function audienceForKey(key) {
  const k = String(key || '').trim();
  if (/^RM[_\s-]*\d/i.test(k)) return 'RM';
  if (/^BH[_\s-]*\d/i.test(k)) return 'BH';
  return 'EMPLOYEE';
}

// Resolve a normalised question's audience (explicit field wins, else by key).
export function questionAudience(q) {
  return q?.audience || audienceForKey(q?.key || q?.question_key);
}

// True when a column header is a reserved (non-profile) column that must never
// appear in an employee/reviewer "profile" card: a numbered question, an OJT
// RM_/BH_ question, or an HR commenter question (HR_SPOC_/HR_HEAD_/COTO_).
// Plain routing names like "RM_NAME"/"BH_EMAIL" do NOT match (no digit), so
// reviewer names can still be shown.
export function isReservedColumnKey(key) {
  const k = String(key || '').trim();
  if (/^__EMPTY/i.test(k)) return true;                          // xlsx blank header
  if (/^\s*\d+[.)]\s/.test(k)) return true;                      // "1. ..." numbered question
  if (/^(RM|BH|BM)[_\s-]*\d/i.test(k)) return true;              // OJT RM_1 / BH_2 questions
  if (/^(HR[_\s-]*SPOC|HR[_\s-]*HEAD|COTO)[_\s-]/i.test(k)) return true; // HR commenter questions
  return false;
}

// Split a list of normalised questions ({ key, label, ... }) into the three
// audience buckets, preserving order within each bucket.
export function splitQuestionsByAudience(questions) {
  const out = { EMPLOYEE: [], RM: [], BH: [] };
  for (const q of (Array.isArray(questions) ? questions : [])) {
    const aud = questionAudience(q);
    (out[aud] || out.EMPLOYEE).push(q);
  }
  return out;
}
