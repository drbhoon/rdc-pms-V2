/**
 * PersonPicker — type-a-few-letters lookup for an RM or BH.
 *
 * Matches against the employee master already loaded in the page, so there is
 * no request per keystroke: no lag, no debounce, and no chance of an earlier
 * response landing after a later one and overwriting it.
 *
 * Keyboard-first on purpose. A batch of 25 employees is 50 of these fields, so
 * the flow has to be type → Enter → Tab without touching the mouse.
 *
 * Only the employee CODE is emitted. Names and e-mail addresses are resolved
 * server-side at launch, so nothing the browser holds can put a wrong reviewer
 * address on an assessment.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export default function PersonPicker({ people, value, onChange, placeholder, ariaLabel }) {
  const chosen = value ? people.find((p) => p.employee_code === value) : null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return people
      .filter((p) =>
        (p.employee_name || '').toLowerCase().includes(q) ||
        (p.employee_code || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, people]);

  useEffect(() => { setActive(0); }, [query]);

  // Close when focus or the pointer leaves, so an abandoned dropdown does not
  // sit over the row below it.
  useEffect(() => {
    function onDocDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  function choose(person) {
    // Someone with no e-mail can never be invited, so they cannot be picked.
    // Shown greyed rather than hidden, or HR hunts for a name that is present
    // in the master but absent here.
    if (!person.official_email_id) return;
    onChange(person.employee_code);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  if (chosen) {
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2 py-1.5 text-xs text-slate-800"
              title={`${chosen.employee_name} · ${chosen.employee_code} · ${chosen.official_email_id || 'no e-mail'}`}>
          {chosen.employee_name}
          <span className="ml-1 font-mono text-[10px] text-slate-500">{chosen.employee_code}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange('')}
          className="shrink-0 rounded px-1 text-xs text-slate-400 hover:text-red-600"
          title="Clear"
        >✕</button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
      />
      {open && query.trim().length >= 2 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-400">No one matches “{query}”</li>
          ) : matches.map((p, i) => {
            const noEmail = !p.official_email_id;
            return (
              <li key={p.employee_code}>
                <button
                  type="button"
                  disabled={noEmail}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                  className={`flex w-full flex-col items-start px-3 py-1.5 text-left text-xs ${
                    noEmail ? 'cursor-not-allowed opacity-50'
                            : i === active ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="font-medium text-slate-800">
                    {p.employee_name}
                    <span className="ml-1 font-mono text-[10px] text-slate-500">{p.employee_code}</span>
                  </span>
                  {/* Designation and location disambiguate repeated first
                      names — the master has several of them. */}
                  <span className="text-[11px] text-slate-500">
                    {[p.designation, p.location].filter(Boolean).join(' · ') || '—'}
                  </span>
                  {noEmail && <span className="text-[11px] text-amber-600">no e-mail — cannot be invited</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
