/** Checking what the admin screen sends — shared by create and update. */
import { MAX_QUESTIONS, QUESTION_TYPES } from './polls';

export function normaliseQuestions(input, { allowEmpty = false } = {}) {
  const list = Array.isArray(input) ? input : [];
  // A poll is created with a title alone and its questions typed afterwards on
  // its own screen, so an empty list is valid there. Opening the poll for
  // voting is what insists on at least one question.
  if (!list.length) return allowEmpty ? { questions: [] } : { error: 'Add at least one question.' };
  if (list.length > MAX_QUESTIONS) return { error: `A poll can have at most ${MAX_QUESTIONS} questions.` };

  const questions = [];
  for (const [i, q] of list.entries()) {
    const text = String(q?.text || '').trim();
    if (!text) return { error: `Question ${i + 1} has no text.` };
    const type = QUESTION_TYPES.includes(q?.type) ? q.type : 'SINGLE_CHOICE';
    const optionSource = q?.optionSource === 'PARTICIPANTS' ? 'PARTICIPANTS' : 'LIST';
    let options = null;
    if ((type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') && optionSource === 'LIST') {
      options = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean);
      if (options.length < 2) return { error: `Question ${i + 1} needs at least two options, or set it to vote for a person.` };
    }
    const maxChoices = type === 'MULTI_CHOICE' ? Math.max(1, Number(q?.maxChoices) || 1) : null;
    questions.push({
      order: i + 1, text, type, optionSource, options,
      maxChoices, required: q?.required !== false,
    });
  }
  return { questions };
}
