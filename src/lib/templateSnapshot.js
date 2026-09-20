/**
 * What an assessment was launched with.
 *
 * Templates are editable in place. Without a snapshot, editing one would
 * rewrite every assessment already in flight: a reviewer who opened the form
 * yesterday would come back to different questions, and answers already given
 * would be stranded under keys nobody asks for any more. That is why HR had to
 * clone a template for every small change.
 *
 * So each pair keeps a copy of the questions (and the HR commenter field
 * definitions) as they stood at launch, and the forms and reports read the
 * pair's copy. Editing a template changes what the NEXT launch asks, and
 * nothing that is already running.
 *
 * Pairs launched before this existed have no snapshot; they fall back to the
 * live template, exactly as they did before.
 */

/** The copy stored on a pair at launch. */
export function templateSnapshotOf(role) {
  if (!role) return null;
  return {
    questions:    Array.isArray(role.questions) ? role.questions : [],
    hrSpocFields: Array.isArray(role.hrSpocFields) ? role.hrSpocFields : [],
    hrHeadFields: Array.isArray(role.hrHeadFields) ? role.hrHeadFields : [],
    cotoFields:   Array.isArray(role.cotoFields) ? role.cotoFields : [],
    takenAt:      new Date().toISOString(),
  };
}

/** The questions this pair is being assessed on — its own, or the template's. */
export function questionsForPair(pair, role) {
  const snapshot = pair?.templateSnapshot;
  if (snapshot && Array.isArray(snapshot.questions) && snapshot.questions.length) return snapshot.questions;
  return Array.isArray(role?.questions) ? role.questions : [];
}

const FIELD_KEY = { HR_SPOC: 'hrSpocFields', HR_HEAD: 'hrHeadFields', COTO: 'cotoFields' };

/** The fields one commenter stage fills on this pair. */
export function hrFieldsForPair(pair, role, stageRole) {
  const key = FIELD_KEY[stageRole];
  if (!key) return [];
  const fromSnapshot = pair?.templateSnapshot?.[key];
  if (Array.isArray(fromSnapshot) && fromSnapshot.length) return fromSnapshot;
  return Array.isArray(role?.[key]) ? role[key] : [];
}

/**
 * One question list covering a whole report.
 *
 * A cycle can span an edit: some pairs carry the old questions, later ones the
 * new. The report shows the template's current questions first, then any
 * question a pair was actually asked that the template no longer has — so an
 * answer already given never disappears from the report because somebody
 * tidied the template afterwards.
 */
export function mergedQuestions(role, pairs) {
  const merged = [];
  const seen = new Set();
  const add = (q) => {
    const key = String(q.question_key || q.key || '').trim();
    if (!key || seen.has(key.toLowerCase())) return;
    seen.add(key.toLowerCase());
    merged.push(q);
  };
  (Array.isArray(role?.questions) ? role.questions : []).forEach(add);
  (pairs || []).forEach((pair) => {
    const snapshot = pair?.templateSnapshot;
    if (snapshot && Array.isArray(snapshot.questions)) snapshot.questions.forEach(add);
  });
  return merged;
}
