/**
 * PriorAnswersPanel — read-only display of earlier stages' answers for OJT
 * (segmented) templates, where each role answered a DIFFERENT set of questions.
 *
 * Props:
 *   stages: [{ label, accent?, items: [{ label, value }] }]
 * Renders one collapsible card per stage with a Question → Answer list.
 */
import { useState } from 'react';

const ACCENT = {
  EMPLOYEE: 'text-indigo-600',
  RM:       'text-blue-600',
  BH:       'text-green-600',
};

function StageBlock({ label, accent, items }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between py-2 text-xs font-semibold uppercase tracking-wide"
      >
        <span className={ACCENT[accent] || 'text-slate-600'}>{label}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2 pl-1 pb-2">
          {items.map((it, i) => (
            <div key={i} className="text-sm">
              <div className="text-xs text-slate-500">{it.label}</div>
              <div className="text-slate-800">
                {it.value === undefined || it.value === null || String(it.value).trim() === ''
                  ? <span className="text-slate-300">—</span>
                  : String(it.value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PriorAnswersPanel({ stages, title = 'Earlier Responses' }) {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  return (
    <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
        {title} <span className="ml-2 text-xs font-normal text-amber-600">View only</span>
      </div>
      <div className="px-5 py-3 divide-y divide-slate-100">
        {stages.map((s, i) => (
          <StageBlock key={i} label={s.label} accent={s.accent} items={s.items || []} />
        ))}
      </div>
    </div>
  );
}
