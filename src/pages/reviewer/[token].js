/**
 * /reviewer/[token]
 * Dashboard for a single RM or BH — lists all their pending assessments.
 * Click a name → existing /form/rm/[pairToken] or /form/bh/[pairToken] opens.
 * After submit the form pages send the user back here (?from=form).
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ReviewerDashboard() {
  const router = useRouter();
  const { token, from } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    fetch(`/api/reviewer/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load');
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // If user just submitted, reload to reflect the changed list
  useEffect(() => { if (from === 'form' && token) load(); }, [from, token, load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading your assessments…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-sm border border-red-200 px-8 py-10 text-center">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Link Problem</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const { reviewer, role, pending, done } = data;
  const isSelf = reviewer.role === 'SELF';
  const isBh   = reviewer.role === 'BH';
  const title    = isSelf ? 'Self-Assessment' : isBh ? 'Approver (BH)' : 'Reviewer (RM)';
  const accentBg = isSelf ? 'bg-indigo-600' : isBh ? 'bg-emerald-600' : 'bg-blue-600';
  const accentText = isSelf ? 'text-indigo-700' : isBh ? 'text-emerald-700' : 'text-blue-700';
  const formBase = isSelf ? '/form/self' : isBh ? '/form/bh' : '/form/rm';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">RDC PARAKH</span>
            <span className="text-xs text-slate-300">SYSTEM</span>
          </div>
          <div className="mt-3">
            <div className="text-lg font-semibold">{title} Dashboard</div>
            <div className="text-xs text-slate-300 mt-0.5">
              {role.roleLabel} · {reviewer.cycle} · {reviewer.email}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Pending section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              {isSelf ? 'Your Self-Assessment' : 'Pending Assessments'} <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs ${isSelf ? 'bg-indigo-100 text-indigo-700' : isBh ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{pending.length}</span>
            </h2>
            <button onClick={load} className="text-xs text-slate-400 hover:text-slate-600">Refresh</button>
          </div>
          {pending.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg className="w-12 h-12 text-green-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-slate-700">All caught up!</p>
              <p className="text-xs text-slate-400 mt-0.5">You have no pending assessments in this cycle.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((p, i) => (
                <li key={p.pairId} className="hover:bg-slate-50/60 transition-colors">
                  <Link
                    href={`${formBase}/${p.token}?back=${encodeURIComponent(`/reviewer/${token}?from=form`)}`}
                    className="flex items-center gap-4 px-5 py-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{p.empName}</div>
                      <div className="text-xs text-slate-400 font-mono truncate">{p.empCode} · {p.roleKey}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        isSelf ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : isBh ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'
                      }`}>
                        {isSelf ? 'Complete your self-assessment' : isBh ? 'Review & Finalise' : 'Pending your input'}
                      </span>
                      <svg className={`w-4 h-4 ${accentText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Completed section */}
        {done.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">
                Completed <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{done.length}</span>
              </h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {done.map((p, i) => (
                <li key={p.pairId} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{p.empName}</div>
                    <div className="text-xs text-slate-400 font-mono truncate">{p.empCode}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">
                    {p.submittedOn ? new Date(p.submittedOn).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          This is a secure personal link. Please do not share it.
        </p>
      </div>
    </div>
  );
}
