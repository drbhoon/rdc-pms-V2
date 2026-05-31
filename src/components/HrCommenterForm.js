/**
 * HrCommenterForm — shared UI for the three HR commenter forms
 * (HR_SPOC / HR_HEAD / COTO). Renders:
 *   1. Brand header (accent colour per role)
 *   2. Identity strip
 *   3. Read-only "Candidate Rating" panel (Self / RM / BH stacked) — view only
 *   4. Prior HR comments panel (HR_HEAD + COTO only)
 *   5. Editable fields for this role
 *   6. Optional "Download Report" button (HR_SPOC)
 *
 * Driven entirely by the data returned from /api/form/<role>/[token].
 */
import { useState } from 'react';

const RATING_LABEL = {
  '1': '1 – Poor', '2': '2 – Below Average', '3': '3 – Average',
  '4': '4 – Good', '5': '5 – Excellent',
};

const ACCENTS = {
  HR_SPOC: { bar: 'bg-teal-700',   chip: 'bg-teal-600',   btn: 'bg-teal-600 hover:bg-teal-700',     ring: 'focus:ring-teal-500/20 focus:border-teal-500',     title: 'HR-SPOC Review' },
  HR_HEAD: { bar: 'bg-violet-700', chip: 'bg-violet-600', btn: 'bg-violet-600 hover:bg-violet-700', ring: 'focus:ring-violet-500/20 focus:border-violet-500', title: 'HR-HEAD Review' },
  COTO:    { bar: 'bg-rose-700',   chip: 'bg-rose-600',   btn: 'bg-rose-600 hover:bg-rose-700',     ring: 'focus:ring-rose-500/20 focus:border-rose-500',     title: 'COTO Approval' },
};

// ── Editable field renderer ───────────────────────────────────────────────────
function FieldInput({ field, value, onChange, disabled, hasError, ring }) {
  const { key, fieldType, options } = field;
  const errCls = hasError ? 'border-red-400 bg-red-50/30' : 'border-slate-300';
  const base = `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 ${ring} disabled:bg-slate-50 disabled:text-slate-500 transition-all ${errCls}`;

  if (fieldType === 'rating') {
    return (
      <select value={value || ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} className={`bg-white ${base}`}>
        <option value="">— Select —</option>
        {['1', '2', '3', '4', '5'].map((v) => <option key={v} value={v}>{RATING_LABEL[v]}</option>)}
      </select>
    );
  }
  if (fieldType === 'select') {
    const opts = Array.isArray(options) && options.length ? options : ['Yes', 'No', 'Hold'];
    return (
      <select value={value || ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} className={`bg-white ${base}`}>
        <option value="">— Select —</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (fieldType === 'number') {
    return <input type="number" value={value || ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} placeholder="Enter a number" className={`placeholder-slate-400 ${base}`} />;
  }
  if (fieldType === 'date') {
    return <input type="date" value={value || ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} className={base} />;
  }
  // default: narrative
  return (
    <textarea value={value || ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} rows={3}
      placeholder="Enter your comments…" className={`placeholder-slate-400 resize-y ${base}`} />
  );
}

// ── Read-only candidate ratings (Self / RM / BH stacked) ──────────────────────
function CandidatePanel({ questions, readonly }) {
  const [open, setOpen] = useState(true);
  if (!questions || questions.length === 0) return null;
  const showSelf = readonly?.requireSelf && readonly?.selfAnswers;

  const cell = (val) => (val === undefined || val === null || val === '')
    ? <span className="text-slate-300">—</span>
    : (RATING_LABEL[String(val)] || String(val));

  return (
    <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((p) => !p)} className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <span>Candidate Ratings <span className="ml-2 text-xs font-normal text-amber-600">View only — no changes can be made</span></span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-2 text-left font-semibold text-slate-500">#</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-500">Question</th>
                {showSelf && <th className="px-4 py-2 text-left font-semibold text-indigo-600">Self</th>}
                <th className="px-4 py-2 text-left font-semibold text-blue-600">RM</th>
                <th className="px-4 py-2 text-left font-semibold text-green-600">BH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questions.map((q, i) => (
                <tr key={q.key}>
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 text-slate-700">{q.label}</td>
                  {showSelf && <td className="px-4 py-2 text-indigo-700">{cell(readonly.selfAnswers[q.key])}</td>}
                  <td className="px-4 py-2 text-blue-700">{cell(readonly.rmAnswers[q.key])}</td>
                  <td className="px-4 py-2 text-green-700">{cell(readonly.bhAnswers[q.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Prior HR comments (cumulative, read-only) ─────────────────────────────────
function PriorHrPanel({ priorHr }) {
  if (!priorHr || priorHr.length === 0) return null;
  const ROLE_LABEL = { HR_SPOC: 'HR-SPOC', HR_HEAD: 'HR-HEAD', COTO: 'COTO' };
  return (
    <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Earlier HR Comments</div>
      <div className="px-5 py-4 space-y-4">
        {priorHr.map((stage) => (
          <div key={stage.role}>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {ROLE_LABEL[stage.role] || stage.role}{stage.name ? ` · ${stage.name}` : ''}
            </div>
            <div className="space-y-1.5 pl-1">
              {stage.fields.map((f) => (
                <div key={f.key} className="text-sm">
                  <span className="text-slate-500">{f.label}: </span>
                  <span className="text-slate-800">{stage.values?.[f.key] || <span className="text-slate-300">—</span>}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HrCommenterForm({ role, token, data }) {
  const accent = ACCENTS[role] || ACCENTS.HR_SPOC;
  const { pair, questions, readonly, priorHr, fields, existing, alreadySubmitted } = data;

  const router = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const backUrl = router ? router.get('back') : '';

  const [values, setValues] = useState(() => {
    const seed = {};
    for (const f of fields) seed[f.key] = existing?.[f.key] ?? '';
    return seed;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');
  const [touched, setTouched]       = useState(false);

  function handleChange(key, val) { setValues((p) => ({ ...p, [key]: val })); }
  function isMissing(f) {
    const v = values[f.key];
    return v === undefined || v === null || String(v).trim() === '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    const missing = fields.filter(isMissing);
    if (missing.length > 0) {
      setError(`Please complete all ${missing.length} field${missing.length > 1 ? 's' : ''} below.`);
      document.getElementById(`f-${missing[0].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/form/${role.toLowerCase()}/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: values }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Submission failed. Please try again.'); }
      else {
        setSubmitted(true);
        if (backUrl) setTimeout(() => { window.location.href = backUrl; }, 1800);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const locked = alreadySubmitted;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className={`${accent.bar} text-white shadow-md`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg ${accent.chip} flex items-center justify-center font-bold text-sm shrink-0`}>RDC</div>
          <div>
            <div className="font-bold text-base leading-tight tracking-tight">RDC PARAKH</div>
            <div className="text-xs text-white/70 leading-tight">{accent.title}</div>
          </div>
        </div>
      </header>

      <div className="bg-slate-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Emp</span>{pair.empCode}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Name</span>{pair.empName}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Role</span>{pair.roleKey}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Cycle</span>{pair.cycle}</span>
        </div>
      </div>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {/* HR_SPOC: download report */}
        {role === 'HR_SPOC' && !submitted && (
          <div className="mb-5 flex justify-end">
            <a href={`/api/form/hr_spoc/report/${token}`}
               className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 transition-all">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Download Report (.xlsx)
            </a>
          </div>
        )}

        <CandidatePanel questions={questions} readonly={readonly} />
        <PriorHrPanel priorHr={priorHr} />

        {locked && !submitted && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800">
            <svg className="mt-0.5 w-5 h-5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            <div><div className="font-semibold mb-0.5">Already submitted</div><div className="text-amber-700 text-xs">Your input has been recorded. This form is now read-only.</div></div>
          </div>
        )}

        {submitted ? (
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm px-8 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Submitted — thank you.</h2>
            <p className="text-slate-500 text-sm">Your input has been recorded.{backUrl ? ' Returning…' : ' You may close this window.'}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">{accent.title} — Your Input</h2>
                <p className="text-xs text-slate-400 mt-0.5">{fields.length} field{fields.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {fields.map((f) => {
                  const missing = touched && isMissing(f);
                  return (
                    <div key={f.key} id={`f-${f.key}`} className={`px-5 py-5 ${missing ? 'bg-red-50' : ''}`}>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {f.label}
                        <span className="text-red-500 ml-0.5">*</span>
                        {missing && <span className="ml-2 text-xs font-semibold text-red-600">Required</span>}
                      </label>
                      <FieldInput field={f} value={values[f.key]} onChange={handleChange} disabled={locked} hasError={missing} ring={accent.ring} />
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <svg className="mt-0.5 w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            {!locked && (
              <button type="submit" disabled={submitting}
                className={`w-full rounded-xl ${accent.btn} px-6 py-3 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all`}>
                {submitting ? 'Submitting…' : `Submit ${accent.title}`}
              </button>
            )}
          </form>
        )}
      </main>

      <footer className="bg-slate-800 text-slate-400 text-xs text-center py-2">
        RDC Concrete (India) Ltd – PARAKH System
      </footer>
    </div>
  );
}

// Shared getServerSideProps factory for the three role pages.
export function makeHrGetServerSideProps(role) {
  return async function getServerSideProps({ params, req }) {
    const { token } = params;
    const host = process.env.NEXT_PUBLIC_BASE_URL || `http://${req.headers.host}`;
    try {
      const res = await fetch(`${host}/api/form/${role.toLowerCase()}/${token}`);
      if (!res.ok) return { notFound: true };
      const data = await res.json();
      return { props: { role, token, data } };
    } catch {
      return { notFound: true };
    }
  };
}
