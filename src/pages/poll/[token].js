/**
 * The ballot. No login — the link is the identity, as with the RM/BH forms.
 *
 * Says out loud that the vote is not anonymous, because the result sheet names
 * who voted for whom and somebody choosing between two colleagues deserves to
 * know that before they choose.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-900 rounded-t-xl px-6 py-4">
          <span className="text-white font-bold">RDC PARAKH</span>
          <span className="text-slate-400 text-sm ml-2">Poll</span>
        </div>
        <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}

export default function PollForm() {
  const router = useRouter();
  const { token } = router.query;
  const [state, setState] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/poll/${token}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => (ok ? setState(data) : setError(data.error || 'This link is not valid.')))
      .catch(() => setError('Could not load this poll.'));
  }, [token]);

  function setAnswer(q, value) {
    setAnswers((cur) => ({ ...cur, [q.id]: value }));
  }
  function toggleMulti(q, value) {
    setAnswers((cur) => {
      const picked = Array.isArray(cur[q.id]) ? cur[q.id] : [];
      const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
      return { ...cur, [q.id]: next };
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/poll/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record your vote.');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !state) return <Shell><p className="text-sm text-red-600">{error}</p></Shell>;
  if (!state) return <Shell><p className="text-sm text-slate-400">Loading…</p></Shell>;

  if (done || state.alreadyVoted) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-slate-800 mb-2">Thank you, {state.voter.name}</h1>
        <p className="text-sm text-slate-600">Your vote in “{state.poll.title}” has been recorded. A vote cannot be changed once cast.</p>
      </Shell>
    );
  }

  if (!state.open) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-slate-800 mb-2">{state.poll.title}</h1>
        <p className="text-sm text-slate-600">
          This poll is {state.poll.status === 'DRAFT' ? 'not open yet' : 'closed'}, so no vote can be recorded.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-bold text-slate-800">{state.poll.title}</h1>
      {state.poll.description && <p className="text-sm text-slate-600 mt-1">{state.poll.description}</p>}
      <p className="text-xs text-slate-400 mt-2">
        Voting as <strong className="text-slate-600">{state.voter.name} ({state.voter.empCode})</strong>.
        {state.poll.closesAt && ` Closes ${new Date(state.poll.closesAt).toLocaleString('en-IN')}.`}
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
        This vote is not anonymous: the result sheet shows who voted for whom. You can vote once, and you cannot vote for yourself.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        {state.questions.map((q, i) => (
          <fieldset key={q.id} className="border border-slate-200 rounded-lg p-4">
            <legend className="px-2 text-sm font-semibold text-slate-700">
              {i + 1}. {q.text}{q.required && <span className="text-red-500"> *</span>}
            </legend>
            {q.type === 'SHORT_TEXT' && (
              <input value={answers[q.id] || ''} onChange={(e) => setAnswer(q, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            )}
            {q.type === 'MULTI_CHOICE' && (
              <>
                <p className="text-xs text-slate-400 mb-2">Choose up to {q.maxChoices || q.options.length}.</p>
                <div className="space-y-1">
                  {q.options.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={(answers[q.id] || []).includes(o.value)} onChange={() => toggleMulti(q, o.value)} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </>
            )}
            {(q.type === 'SINGLE_CHOICE' || q.type === 'RATING_1_5') && (
              <div className={q.type === 'RATING_1_5' ? 'flex gap-4' : 'space-y-1'}>
                {q.options.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" name={q.id} value={o.value}
                      checked={answers[q.id] === o.value} onChange={() => setAnswer(q, o.value)} />
                    {o.label}
                  </label>
                ))}
                {q.options.length === 0 && <p className="text-xs text-slate-400">No options — nothing to choose.</p>}
              </div>
            )}
          </fieldset>
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-40">
          {saving ? 'Recording…' : 'Submit my vote'}
        </button>
      </form>
    </Shell>
  );
}
