/**
 * Polls: the rules that decide what a voter may do and what the result is.
 *
 * Kept out of the API routes so the voting page, the admin screen and the
 * Excel export all answer the same question the same way — "is this poll still
 * open?" in particular, which has two independent answers to combine (a
 * closing date and a Close now button).
 */
export const MAX_QUESTIONS = 5;
export const MAX_PARTICIPANTS = 100;
export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'RATING_1_5', 'SHORT_TEXT'];
const RATINGS = ['1', '2', '3', '4', '5'];

/**
 * Open means: HR opened it, AND the closing date has not passed. A date in the
 * past closes a poll without anyone having to press anything — which is the
 * point of setting one — but pressing Close now ends it immediately whatever
 * the date says.
 */
export function pollIsOpen(poll, now = new Date()) {
  if (!poll || poll.status !== 'OPEN') return false;
  if (poll.closesAt && new Date(poll.closesAt) <= now) return false;
  return true;
}

/** What to show a reader: DRAFT, OPEN, or CLOSED (including "the date passed"). */
export function effectiveStatus(poll, now = new Date()) {
  if (!poll) return 'DRAFT';
  if (poll.status === 'OPEN' && !pollIsOpen(poll, now)) return 'CLOSED';
  return poll.status;
}

/**
 * The options a given voter sees for one question.
 *
 * For a question whose options are the people themselves, the voter is left
 * out: you cannot vote for yourself. Everyone else is listed by name, valued
 * by employee code so a rename never orphans a vote already cast.
 */
export function optionsFor(question, participants, voterEmpCode) {
  if (question.type === 'RATING_1_5') return RATINGS.map((r) => ({ value: r, label: r }));
  if (question.type === 'SHORT_TEXT') return [];
  if (question.optionSource === 'PARTICIPANTS') {
    return (participants || [])
      .filter((p) => p.empCode !== voterEmpCode)
      .map((p) => ({ value: p.empCode, label: `${p.name} (${p.empCode})` }));
  }
  const listed = Array.isArray(question.options) ? question.options : [];
  return listed.map((o) => ({ value: String(o), label: String(o) }));
}

/** A label for a stored answer value — an employee code becomes a name. */
export function labelForValue(question, value, participants) {
  if (question.optionSource === 'PARTICIPANTS') {
    const person = (participants || []).find((p) => p.empCode === value);
    return person ? `${person.name} (${person.empCode})` : String(value ?? '');
  }
  return String(value ?? '');
}

/**
 * Check one submitted answer sheet. Returns { ok, error, answers }.
 *
 * Rejects rather than trims: a vote that quietly loses a choice is worse than
 * one the voter is asked to correct.
 */
export function validateAnswers(questions, participants, voterEmpCode, submitted) {
  const answers = {};
  for (const q of questions) {
    const raw = submitted?.[q.id];
    const allowed = new Set(optionsFor(q, participants, voterEmpCode).map((o) => o.value));

    if (q.type === 'SHORT_TEXT') {
      const text = String(raw ?? '').trim();
      if (!text && q.required) return { ok: false, error: `"${q.text}" needs an answer.` };
      if (text.length > 2000) return { ok: false, error: `"${q.text}" is too long.` };
      if (text) answers[q.id] = text;
      continue;
    }

    if (q.type === 'MULTI_CHOICE') {
      const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
      if (!picked.length) {
        if (q.required) return { ok: false, error: `"${q.text}" needs an answer.` };
        continue;
      }
      if (new Set(picked).size !== picked.length) return { ok: false, error: `"${q.text}" has the same choice twice.` };
      const limit = q.maxChoices || picked.length;
      if (picked.length > limit) return { ok: false, error: `"${q.text}" allows at most ${limit} choice(s).` };
      for (const value of picked) {
        if (!allowed.has(value)) return { ok: false, error: `"${q.text}" has a choice that is not on the list.` };
      }
      answers[q.id] = picked;
      continue;
    }

    const value = raw === undefined || raw === null ? '' : String(raw);
    if (!value) {
      if (q.required) return { ok: false, error: `"${q.text}" needs an answer.` };
      continue;
    }
    // Catches voting for yourself as well as anything else off the list: the
    // voter's own code is never among the options handed out.
    if (!allowed.has(value)) return { ok: false, error: `"${q.text}" has a choice that is not on the list.` };
    answers[q.id] = value;
  }
  return { ok: true, answers };
}

/**
 * Tally one poll: per question, every option with its vote count, highest
 * first. Short-text questions return the answers themselves — there is nothing
 * to count.
 */
export function tally(poll) {
  const participants = poll.participants || [];
  const voted = participants.filter((p) => p.respondedOn);
  return (poll.questions || []).map((q) => {
    if (q.type === 'SHORT_TEXT') {
      return {
        question: q,
        kind: 'text',
        answers: voted
          .map((p) => ({ name: p.name, empCode: p.empCode, text: p.answers?.[q.id] }))
          .filter((a) => a.text),
      };
    }
    const counts = new Map();
    // Every option starts at zero, so "nobody voted for this one" is visible
    // rather than absent.
    for (const option of optionsFor(q, participants, null)) counts.set(option.value, { ...option, votes: 0, voters: [] });
    for (const p of voted) {
      const raw = p.answers?.[q.id];
      const picked = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const value of picked.map(String)) {
        const entry = counts.get(value) || { value, label: labelForValue(q, value, participants), votes: 0, voters: [] };
        entry.votes += 1;
        entry.voters.push(`${p.name} (${p.empCode})`);
        counts.set(value, entry);
      }
    }
    const rows = [...counts.values()].sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label));
    const total = rows.reduce((sum, r) => sum + r.votes, 0);
    return { question: q, kind: 'counts', rows, total };
  });
}

export function pollProgress(poll) {
  const participants = poll.participants || [];
  const responded = participants.filter((p) => p.respondedOn).length;
  return { invited: participants.length, responded, pending: participants.length - responded };
}
