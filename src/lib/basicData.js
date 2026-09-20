/**
 * The "basic data" rows every form shows above the questions.
 *
 * Four forms (Self, RM, BH and the HR commenter forms) each built this list
 * for themselves, which is how they drifted: three showed a dash for a missing
 * reviewer and the fourth hid the row. One list, so everyone in the flow sees
 * the same employee record.
 *
 * RM, BH and HR-SPOC are ROUTING columns, stripped out of profileData before
 * it reaches the card, so they have to be surfaced explicitly here.
 */
export const BLANK = '—';

export function basicDataRows({ empCode, empName, rmName, bhName, hrSpocName }) {
  const text = (value) => (value == null ? '' : String(value).trim());
  // Named even when empty: a dash says "this template has no HR-SPOC", while
  // a missing row leaves the reader wondering whether it was simply forgotten.
  const row = (label, value) => [label, text(value) || BLANK];
  return [
    empCode ? ['EMP CODE', text(empCode)] : null,
    empName ? ['EMP NAME', text(empName)] : null,
    row('RM NAME', rmName),
    row('BH NAME', bhName),
    row('HR SPOC NAME', hrSpocName),
  ].filter(Boolean);
}

/**
 * Who the HR-SPOC is for one pair.
 *
 * The launch snapshot first (HrReview.name, taken when HR launched), the
 * template second. A template edited mid-cycle must not rewrite the name on a
 * pair already in flight, but a pair launched before the stage existed still
 * shows the template's current SPOC rather than nothing.
 */
export function hrSpocNameFor(pair, role) {
  const review = (pair?.hrReviews || []).find((r) => r.role === 'HR_SPOC');
  return (review?.name || role?.hrSpocName || '').trim();
}
