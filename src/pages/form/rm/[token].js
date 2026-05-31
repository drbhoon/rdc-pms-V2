/**
 * pages/form/rm/[token].js
 * Public RM Assessment Form — no login required; token IS the auth.
 */
import { useState } from 'react';

const RATING_OPTIONS = [
  { value: '',  label: '— Select —' },
  { value: '1', label: '1 – Poor' },
  { value: '2', label: '2 – Below Average' },
  { value: '3', label: '3 – Average' },
  { value: '4', label: '4 – Good' },
  { value: '5', label: '5 – Excellent' },
];

// ── Question field renderers ─────────────────────────────────────────────────

function QuestionField({ question, value, onChange, disabled, hasError }) {
  const { key, fieldType } = question;
  const errCls = hasError ? 'border-red-400 bg-red-50/30' : 'border-slate-300';
  const base = `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500 transition-all ${errCls}`;

  if (fieldType === 'rating') {
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(key, e.target.value)}
        disabled={disabled}
        className={`bg-white ${base}`}
      >
        {RATING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
  if (fieldType === 'narrative') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(key, e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder="Enter your response…"
        className={`placeholder-slate-400 resize-y ${base}`}
      />
    );
  }
  if (fieldType === 'number') {
    return (
      <input type="number" value={value || ''} onChange={(e) => onChange(key, e.target.value)}
        disabled={disabled} placeholder="Enter a number" className={`placeholder-slate-400 ${base}`} />
    );
  }
  if (fieldType === 'date') {
    return (
      <input type="date" value={value || ''} onChange={(e) => onChange(key, e.target.value)}
        disabled={disabled} className={base} />
    );
  }
  return null;
}

// ── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({ empCode, empName, profileData }) {
  const [open, setOpen] = useState(true);
  const profileEntries = Object.entries(profileData || {});

  // Always show emp code + name first, then all other profile fields
  const fixed = [
    empCode ? ['EMP CODE', empCode] : null,
    empName ? ['EMP NAME', empName] : null,
  ].filter(Boolean);
  const entries = [...fixed, ...profileEntries];
  if (!entries.length) return null;

  return (
    <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span>Employee Profile</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">{k}</div>
              <div className="text-sm text-slate-700 mt-0.5">{String(v || '—')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RmFormPage({ pair, questions, employee, token }) {
  const router = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search))
    : null;
  const backUrl = router ? router.get('back') : '';
  const [answers, setAnswers] = useState(
    Object.fromEntries(questions.map((q) => [q.key, '']))
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');
  const [touched, setTouched]       = useState(false); // show validation after first submit attempt

  function handleChange(key, value) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function isMissing(q) {
    const v = answers[q.key];
    return v === undefined || v === null || String(v).trim() === '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    const missing = questions.filter(isMissing);
    if (missing.length > 0) {
      setError(`Please answer all ${missing.length} unanswered question${missing.length > 1 ? 's' : ''} highlighted in red below.`);
      // Scroll to first unanswered
      document.getElementById(`q-${missing[0].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/form/rm/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Submission failed. Please try again.');
      } else {
        setSubmitted(true);
        if (backUrl) setTimeout(() => { window.location.href = backUrl; }, 1800);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = pair.status !== 'PENDING_RM';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[#0f172a] text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
            RDC
          </div>
          <div>
            <div className="font-bold text-base leading-tight tracking-tight">RDC PMS</div>
            <div className="text-xs text-slate-400 leading-tight">RM Assessment Form</div>
          </div>
        </div>
      </header>

      {/* ── Identity strip ── */}
      <div className="bg-slate-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Emp</span>{pair.empCode}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Name</span>{pair.empName}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Role</span>{pair.roleKey}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">Cycle</span>{pair.cycle}</span>
          <span><span className="text-slate-400 text-xs uppercase tracking-wide mr-1">RM</span>{pair.rmName}</span>
        </div>
      </div>

      {/* ── Content ── */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {/* Profile card */}
        <ProfileCard empCode={pair.empCode} empName={pair.empName} profileData={employee?.profileData} />

        {/* Locked notice */}
        {isLocked && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800">
            <svg className="mt-0.5 w-5 h-5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <div>
              <div className="font-semibold mb-0.5">Already submitted</div>
              <div className="text-amber-700 text-xs">This RM assessment has already been submitted. The form is now read-only.</div>
            </div>
          </div>
        )}

        {/* Thank-you screen */}
        {submitted ? (
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm px-8 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Assessment submitted successfully.</h2>
            <p className="text-slate-500 text-sm">
              Thank you for completing the RM assessment.
              {backUrl ? ' Returning to your dashboard…' : ' You may close this window.'}
            </p>
            {backUrl && (
              <a href={backUrl} className="inline-block mt-4 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                Back to Dashboard
              </a>
            )}
          </div>
        ) : (
          /* Questions form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Assessment Questions</h2>
                <p className="text-xs text-slate-400 mt-0.5">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {questions.map((q, idx) => {
                  const missing = touched && isMissing(q);
                  return (
                    <div key={q.key} id={`q-${q.key}`}
                      className={`px-5 py-5 transition-colors ${missing ? 'bg-red-50' : ''}`}>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        <span className="text-slate-400 mr-1.5">{idx + 1}.</span>
                        {q.label}
                        <span className="text-red-500 ml-0.5">*</span>
                        <span className="ml-2 text-xs font-normal text-slate-400 capitalize">({q.fieldType})</span>
                        {missing && <span className="ml-2 text-xs font-semibold text-red-600">Required</span>}
                      </label>
                      <QuestionField
                        question={q}
                        value={answers[q.key]}
                        onChange={handleChange}
                        disabled={isLocked}
                        hasError={missing}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <svg className="mt-0.5 w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {!isLocked && (
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting…
                  </span>
                ) : (
                  'Submit RM Assessment'
                )}
              </button>
            )}
          </form>
        )}
      </main>

      <footer className="bg-slate-800 text-slate-400 text-xs text-center py-2">
        RDC Concrete (India) Ltd – PMS v1.0
      </footer>
    </div>
  );
}

export async function getServerSideProps({ params, req }) {
  const { token } = params;
  const host = process.env.NEXT_PUBLIC_BASE_URL || `http://${req.headers.host}`;

  try {
    const res = await fetch(`${host}/api/form/rm/${token}`);
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { notFound: true };
    const data = await res.json();
    return {
      props: {
        pair:      data.pair,
        questions: data.questions,
        employee:  data.employee || null,
        token,
      },
    };
  } catch {
    return { notFound: true };
  }
}
