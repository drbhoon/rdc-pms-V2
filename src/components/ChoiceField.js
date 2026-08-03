/**
 * ChoiceField — renders a Multiple Choice question on the Self/RM/BH forms.
 *
 * Shows the HR-defined options in a dropdown. When the question allows "Other",
 * an "Other…" entry appears; selecting it reveals a free-text box, and whatever
 * the user types becomes the answer (so reports show the actual comment).
 *
 * The answer is a single string (a preset value, or the typed "Other" text).
 * On load, a stored value that isn't one of the presets is treated as an
 * "Other" answer so the text box re-opens pre-filled.
 */
import { useState } from 'react';

const OTHER = '__OTHER__';

export default function ChoiceField({ question, value, onChange, disabled, baseClassName }) {
  const opts = Array.isArray(question.options) && question.options.length
    ? question.options
    : ['1', '2', '3', '4', '5'];
  const allowOther = !!question.allowOther;

  // A stored value not among the presets means the user picked "Other".
  const storedIsOther = value != null && value !== '' && !opts.includes(String(value));
  const [otherMode, setOtherMode] = useState(allowOther && storedIsOther);

  const selectValue = otherMode ? OTHER : (value || '');

  function handleSelect(v) {
    if (v === OTHER) {
      setOtherMode(true);
      onChange(question.key, ''); // clear until they type the comment
    } else {
      setOtherMode(false);
      onChange(question.key, v);
    }
  }

  return (
    <div>
      <select
        value={selectValue}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={disabled}
        className={`bg-white ${baseClassName}`}
      >
        <option value="">— Select —</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        {allowOther && <option value={OTHER}>Other…</option>}
      </select>
      {otherMode && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(question.key, e.target.value)}
          disabled={disabled}
          placeholder="Please specify…"
          className={`mt-2 placeholder-slate-400 ${baseClassName}`}
        />
      )}
    </div>
  );
}
