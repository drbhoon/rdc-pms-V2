/**
 * Polls — run a short vote among a group of people.
 *
 * Separate from assessments on purpose: no reviewer chain, no template, no
 * cycle. Pick people from the employee master, ask up to five questions, mail
 * everyone their own link, watch the count come in, download the result.
 *
 * One screen, three panes (list → build → results), because a poll is a short
 * lived thing and bouncing between pages for a five-question vote is worse
 * than a slightly long page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import PersonPicker from '../../components/PersonPicker';
import { getPageAuth } from '../../lib/auth';
import { MAX_PARTICIPANTS, MAX_QUESTIONS, QUESTION_TYPES } from '../../lib/polls';

const TYPE_LABEL = {
  SINGLE_CHOICE: 'Pick one',
  MULTI_CHOICE: 'Pick several',
  RATING_1_5: 'Rating 1–5',
  SHORT_TEXT: 'Short answer',
};

const blankQuestion = () => ({ text: '', type: 'SINGLE_CHOICE', optionSource: 'PARTICIPANTS', options: ['', ''], maxChoices: 1, required: true });

function StatusPill({ status }) {
  const style = { DRAFT: 'bg-slate-100 text-slate-600', OPEN: 'bg-emerald-100 text-emerald-700', CLOSED: 'bg-slate-800 text-white' }[status] || 'bg-slate-100';
  return <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${style}`}>{status}</span>;
}

export default function PollsPage({ user }) {
  const [polls, setPolls] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [people, setPeople] = useState([]);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');

  const say = (message, type = 'success') => setToast({ message, type });

  const loadPolls = useCallback(async () => {
    const res = await fetch('/api/admin/polls');
    const data = await res.json();
    setPolls(data.polls || []);
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    const res = await fetch(`/api/admin/polls/${id}`);
    const data = await res.json();
    if (!res.ok) { say(data.error || 'Could not open that poll', 'error'); return; }
    setDetail(data);
  }, []);

  useEffect(() => { loadPolls(); }, [loadPolls]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => {
    // The master drives the participant picker; without it a poll cannot be
    // addressed to anyone, so the page says so rather than silently offering
    // an empty list.
    fetch('/api/admin/master/employees?picker=1')
      .then((r) => r.json())
      .then((d) => setPeople(d.employees || []))
      .catch(() => setPeople([]));
  }, []);

  async function call(url, options, okMessage) {
    setBusy(url);
    try {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (HTTP ${res.status})`);
      if (okMessage) say(data.message || okMessage);
      await loadPolls();
      if (selectedId) await loadDetail(selectedId);
      return data;
    } catch (err) {
      say(err.message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  }

  return (
    <AdminLayout title="Polls" user={user}>
      {toast && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-xs font-semibold">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        <PollList polls={polls} selectedId={selectedId} onSelect={setSelectedId} onCreated={(id) => { loadPolls(); setSelectedId(id); }} say={say} />
        {detail
          ? <PollDetail detail={detail} people={people} busy={busy} call={call} onDeleted={() => { setSelectedId(null); loadPolls(); }} />
          : <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-sm text-slate-400">
              Pick a poll on the left, or create one.
            </div>}
      </div>
    </AdminLayout>
  );
}

// ── Left: list + create ───────────────────────────────────────────────────────
function PollList({ polls, selectedId, onSelect, onCreated, say }) {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), questions: [blankQuestion()] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the poll');
      setTitle('');
      onCreated(data.poll.id);
    } catch (err) {
      say(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">New poll</h2>
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. Best presentation — GET 2026"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
          <button onClick={create} disabled={creating || !title.trim()}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-40">
            {creating ? '…' : 'Create'}
          </button>
        </div>
      </div>
      <div className="border-t border-slate-100 pt-3 space-y-2 max-h-[60vh] overflow-y-auto">
        {polls.length === 0 && <p className="text-xs text-slate-400">No polls yet.</p>}
        {polls.map((p) => (
          <button key={p.id} onClick={() => onSelect(p.id)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${selectedId === p.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700 truncate">{p.title}</span>
              <StatusPill status={p.status} />
            </div>
            <span className="block text-xs text-slate-400 mt-0.5">
              {p.questionCount} question(s) · {p.responded}/{p.invited} voted
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Right: one poll ───────────────────────────────────────────────────────────
function PollDetail({ detail, people, busy, call, onDeleted }) {
  const { poll, progress, results } = detail;
  const id = poll.id;
  const locked = progress.responded > 0; // questions are frozen once votes exist
  const [questions, setQuestions] = useState(() => poll.questions.map((q) => ({
    text: q.text, type: q.type, optionSource: q.optionSource,
    options: Array.isArray(q.options) && q.options.length ? q.options : ['', ''],
    maxChoices: q.maxChoices || 1, required: q.required,
  })));
  const [closesAt, setClosesAt] = useState(poll.closesAt ? new Date(poll.closesAt).toISOString().slice(0, 16) : '');
  const [description, setDescription] = useState(poll.description || '');
  const [picked, setPicked] = useState(() => poll.participants.map((p) => p.empCode));
  const [pickOne, setPickOne] = useState('');

  useEffect(() => {
    setQuestions(poll.questions.map((q) => ({
      text: q.text, type: q.type, optionSource: q.optionSource,
      options: Array.isArray(q.options) && q.options.length ? q.options : ['', ''],
      maxChoices: q.maxChoices || 1, required: q.required,
    })));
    setPicked(poll.participants.map((p) => p.empCode));
    setDescription(poll.description || '');
    setClosesAt(poll.closesAt ? new Date(poll.closesAt).toISOString().slice(0, 16) : '');
  }, [poll.id, poll.questions, poll.participants, poll.description, poll.closesAt]);

  const byCode = useMemo(() => new Map(people.map((p) => [p.employee_code, p])), [people]);
  const patchQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 truncate">{poll.title}</h2>
              <StatusPill status={poll.status} />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {progress.responded} of {progress.invited} voted · {poll.closesAt ? `closes ${new Date(poll.closesAt).toLocaleString('en-IN')}` : 'no closing date'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {poll.status !== 'OPEN' && poll.status !== 'CLOSED' && (
              <button onClick={() => call(`/api/admin/polls/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open' }) }, 'Poll opened.')}
                disabled={!!busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white disabled:opacity-40">Open poll</button>
            )}
            {poll.status === 'OPEN' && (
              <>
                <button onClick={() => call(`/api/admin/polls/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 'Invitations sent.')}
                  disabled={!!busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-40">Send links</button>
                <button onClick={() => call(`/api/admin/polls/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminder: true }) }, 'Reminders sent.')}
                  disabled={!!busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 disabled:opacity-40">Remind non-voters</button>
                <button onClick={() => call(`/api/admin/polls/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close' }) }, 'Poll closed.')}
                  disabled={!!busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40">Close now</button>
              </>
            )}
            <a href={`/api/admin/polls/${id}/export`}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700">Download Excel</a>
            <button onClick={() => { if (confirm(`Delete "${poll.title}" and every vote in it?`)) call(`/api/admin/polls/${id}`, { method: 'DELETE' }, 'Poll deleted.').then(onDeleted); }}
              disabled={!!busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 disabled:opacity-40">Delete</button>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Questions <span className="text-slate-400 font-normal">({questions.length}/{MAX_QUESTIONS})</span></h3>
          {!locked && questions.length < MAX_QUESTIONS && (
            <button onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600">+ Add question</button>
          )}
        </div>
        {locked && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {progress.responded} vote(s) are already in, so the questions are fixed. Changing them now would
            re-interpret votes already cast.
          </p>
        )}
        {questions.map((q, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <span className="text-xs text-slate-400 pt-2 w-5">{i + 1}.</span>
              <input value={q.text} disabled={locked} onChange={(e) => patchQ(i, { text: e.target.value })}
                placeholder="Question"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
              <select value={q.type} disabled={locked} onChange={(e) => patchQ(i, { type: e.target.value })}
                className="px-2 py-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50">
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              {!locked && questions.length > 1 && (
                <button onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-500 font-semibold px-2">Remove</button>
              )}
            </div>
            {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE') && (
              <div className="ml-7 space-y-2">
                <div className="flex gap-4 text-xs text-slate-600">
                  <label className="inline-flex items-center gap-1">
                    <input type="radio" disabled={locked} checked={q.optionSource === 'PARTICIPANTS'} onChange={() => patchQ(i, { optionSource: 'PARTICIPANTS' })} />
                    Vote for a person in this poll
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input type="radio" disabled={locked} checked={q.optionSource === 'LIST'} onChange={() => patchQ(i, { optionSource: 'LIST' })} />
                    Choose from my own options
                  </label>
                  {q.type === 'MULTI_CHOICE' && (
                    <label className="inline-flex items-center gap-1">
                      Max choices
                      <input type="number" min="1" max="10" value={q.maxChoices} disabled={locked}
                        onChange={(e) => patchQ(i, { maxChoices: Number(e.target.value) || 1 })}
                        className="w-14 px-2 py-1 border border-slate-200 rounded" />
                    </label>
                  )}
                </div>
                {q.optionSource === 'PARTICIPANTS'
                  ? <p className="text-xs text-slate-400">Everyone in the poll is listed, except the person voting — nobody can vote for themselves.</p>
                  : (
                    <div className="space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <input value={opt} disabled={locked}
                            onChange={(e) => patchQ(i, { options: q.options.map((o, x) => (x === oi ? e.target.value : o)) })}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
                          {!locked && q.options.length > 2 && (
                            <button onClick={() => patchQ(i, { options: q.options.filter((_, x) => x !== oi) })}
                              className="text-xs text-slate-400 px-2">×</button>
                          )}
                        </div>
                      ))}
                      {!locked && (
                        <button onClick={() => patchQ(i, { options: [...q.options, ''] })}
                          className="text-xs text-blue-600 font-semibold">+ option</button>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <label className="text-xs text-slate-500">
            Note for voters (optional)
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </label>
          <label className="text-xs text-slate-500">
            Closes on (optional — you can also close it by hand)
            <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </label>
        </div>
        <button
          onClick={() => call(`/api/admin/polls/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, closesAt: closesAt || null, ...(locked ? {} : { questions }) }),
          }, 'Saved.')}
          disabled={!!busy}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white disabled:opacity-40">
          Save poll
        </button>
      </div>

      {/* Participants */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Participants <span className="text-slate-400 font-normal">({picked.length}/{MAX_PARTICIPANTS})</span>
        </h3>
        {people.length === 0 && <p className="text-xs text-amber-700">The employee master is not reachable, so nobody can be added.</p>}
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <PersonPicker people={people} value={pickOne} placeholder="Type a name or code to add"
              ariaLabel="Add participant"
              onChange={(code) => {
                if (!code) return;
                setPicked((cur) => (cur.includes(code) || cur.length >= MAX_PARTICIPANTS ? cur : [...cur, code]));
                setPickOne('');
              }} />
          </div>
          <button
            onClick={() => call(`/api/admin/polls/${id}/participants`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ empCodes: picked }),
            }, 'Participants saved.')}
            disabled={!!busy || !picked.length}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-40">
            Save participants
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {picked.map((code) => {
            const person = byCode.get(code);
            const saved = poll.participants.find((p) => p.empCode === code);
            return (
              <span key={code} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${saved?.respondedOn ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                {person?.employee_name || saved?.name || code} ({code})
                {saved?.respondedOn && ' ✓'}
                <button onClick={() => setPicked((cur) => cur.filter((c) => c !== code))} className="text-slate-400 hover:text-red-500">×</button>
              </span>
            );
          })}
          {!picked.length && <span className="text-xs text-slate-400">Nobody added yet.</span>}
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <h3 className="text-sm font-semibold text-slate-700">Results <span className="text-slate-400 font-normal">({progress.responded} of {progress.invited} voted)</span></h3>
        {results.map((r, i) => (
          <div key={r.question.id}>
            <p className="text-sm font-semibold text-slate-700 mb-2">{i + 1}. {r.question.text}</p>
            {r.kind === 'text' ? (
              r.answers.length === 0 ? <p className="text-xs text-slate-400">No answers yet.</p> : (
                <ul className="space-y-1 text-sm text-slate-600">
                  {r.answers.map((a, x) => <li key={x}>“{a.text}” <span className="text-xs text-slate-400">— {a.name}</span></li>)}
                </ul>
              )
            ) : (
              <div className="space-y-1">
                {r.rows.map((row) => (
                  <div key={row.value} className="flex items-center gap-3">
                    <span className="w-56 truncate text-sm text-slate-600">{row.label}</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: r.total ? `${(row.votes / r.total) * 100}%` : 0 }} />
                    </div>
                    <span className="w-24 text-xs text-slate-500 text-right" title={row.voters.join(', ')}>
                      {row.votes} vote{row.votes === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!results.length && <p className="text-xs text-slate-400">Add a question to see results here.</p>}
      </div>
    </div>
  );
}

export async function getServerSideProps({ req }) {
  return getPageAuth(req);
}
