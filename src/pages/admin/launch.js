/**
 * admin/launch.js — Launch a cycle from the shared employee master.
 *
 * Replaces the upload-a-spreadsheet flow: pick a template, filter the master,
 * tick the people, name their RM and BH, launch.
 *
 * The filters are the portal's own, from its /master page: On roll / Off roll,
 * name or code, Location, Designation, Company, Cost centre, date of joining
 * and date of birth, applied with "Apply filters". The portal runs the query,
 * so for the same filters this page lists exactly the people /master lists,
 * and the checkbox lists are the ones /master offers (from its
 * filter-options endpoint).
 *
 * The whole master is still loaded once for the RM / BH / HR SPOC lookups,
 * which must search everybody whatever the filters show.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import PersonPicker from '../../components/PersonPicker';
import { getPageAuth } from '../../lib/auth';
import { editableProfileCols } from '../../lib/masterProfile';

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 6000);
    return () => clearTimeout(id);
  }, [onClose]);
  const base = 'fixed bottom-6 right-6 z-50 max-w-md rounded-xl px-5 py-3.5 shadow-xl text-sm font-medium';
  return <div className={type === 'error' ? `${base} bg-red-600 text-white` : `${base} bg-green-600 text-white`}>{message}</div>;
}

// ── The portal's /master filter panel ─────────────────────────────────────
// Carried over from rdc-hr-portal app/master/FilterPanel.tsx, same controls in
// the same order. The one difference is that /master's panel is a GET form that
// reloads the page; here that would throw away the people already ticked, so
// the same values are held in state and "Apply filters" fetches the list.

const NO_FILTERS = {
  source: '', q: '',
  location: [], designation: [], company: [], cost_centre: [],
  doj_from: '', doj_to: '', dob_from: '', dob_to: '',
};

const FACETS = [
  { name: 'location', label: 'Location', from: 'locations' },
  { name: 'designation', label: 'Designation', from: 'designations' },
  { name: 'company', label: 'Company', from: 'companies' },
  { name: 'cost_centre', label: 'Cost centre', from: 'costCentres' },
];

/** How many filters are set — counted as /master counts them. */
function countFilters(f) {
  return FACETS.reduce((n, { name }) => n + f[name].length, 0)
    + (f.q.trim() ? 1 : 0) + (f.source ? 1 : 0)
    + ['doj_from', 'doj_to', 'dob_from', 'dob_to'].filter((k) => f[k]).length;
}

/** The filters as the master API's query string (the same names /master uses). */
function filterQuery(f) {
  const params = new URLSearchParams({ picker: '1' });
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.source) params.set('source', f.source);
  for (const { name } of FACETS) for (const v of f[name]) params.append(name, v);
  for (const k of ['doj_from', 'doj_to', 'dob_from', 'dob_to']) if (f[k]) params.set(k, f[k]);
  return params.toString();
}

/** A searchable checkbox list for one facet, as on /master. */
function FacetFilter({ label, options, selected, onChange }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    // Chosen values stay visible even when the search would hide them —
    // otherwise a tick silently vanishes as soon as you type the next word.
    const pinned = options.filter((o) => selected.includes(o) && !matches.includes(o));
    return [...pinned, ...matches];
  }, [query, options, selected]);

  function toggle(option) {
    onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option]);
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        {selected.length > 0 ? (
          <button type="button" onClick={() => onChange([])} title="Clear this filter"
                  className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200">
            {selected.length} selected ✕
          </button>
        ) : (
          <span className="text-xs text-slate-400">{options.length}</span>
        )}
      </div>
      <div className="px-3 pt-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder={`Search ${label.toLowerCase()}…`}
               className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-blue-400 focus:bg-white focus:outline-none" />
      </div>
      <ul className="mt-1 max-h-52 overflow-y-auto px-1 py-1 text-sm">
        {shown.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-slate-400">No match</li>
        ) : shown.map((option) => {
          const on = selected.includes(option);
          return (
            <li key={option}>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 ${
                on ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                {/* Explicit name: the wrapping <label> alone left these
                    announced as bare "on" to assistive tech and to tooling. */}
                <input type="checkbox" checked={on} onChange={() => toggle(option)}
                       aria-label={`${label}: ${option}`} className="mt-0.5 accent-blue-600" />
                <span className="leading-snug">{option}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilterPanel({ draft, setDraft, options, appliedCount, resultCount, applying, onApply, onClear }) {
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(); }}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* On roll / off roll first, as on /master: it is the first cut HR
            makes — two populations from two feeds — where the rest only
            narrow within whichever was picked. */}
        <fieldset className="w-full">
          <legend className="mb-1 block text-sm font-semibold text-slate-700">Employees</legend>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
            {[
              { value: '', label: 'All' },
              { value: 'onroll', label: 'On roll' },
              { value: 'offroll', label: 'Off roll / third party' },
            ].map((option) => (
              <label key={option.value || 'all'} className="cursor-pointer">
                <input type="radio" name="source" value={option.value}
                       checked={draft.source === option.value}
                       onChange={() => set('source', option.value)} className="peer sr-only" />
                <span className="block px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 peer-checked:bg-blue-600 peer-checked:text-white">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="min-w-[260px] flex-1 text-sm">
          <span className="mb-1 block font-semibold text-slate-700">Search name or code</span>
          <input value={draft.q} onChange={(e) => set('q', e.target.value)} placeholder="e.g. Gurumurthy or G00064"
                 className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-400 focus:outline-none" />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={applying}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
            {applying ? 'Applying…' : 'Apply filters'}
          </button>
          {(appliedCount > 0 || countFilters(draft) > 0) && (
            <button type="button" onClick={onClear}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {FACETS.map(({ name, label, from }) => (
          <FacetFilter key={name} label={label} options={options[from] || []}
                       selected={draft[name]} onChange={(v) => set(name, v)} />
        ))}

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {[
            ['doj', 'Date of joining', 'Tenure — e.g. the 2025 intake'],
            ['dob', 'Date of birth', 'Age band'],
          ].map(([prefix, label, hint]) => (
            <fieldset key={prefix}>
              <legend className="text-sm font-semibold text-slate-700">{label}</legend>
              <div className="mt-1 flex flex-col gap-1">
                <input type="date" value={draft[`${prefix}_from`]} aria-label={`${label} from`}
                       onChange={(e) => set(`${prefix}_from`, e.target.value)}
                       className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-blue-400 focus:bg-white focus:outline-none" />
                <input type="date" value={draft[`${prefix}_to`]} aria-label={`${label} to`}
                       onChange={(e) => set(`${prefix}_to`, e.target.value)}
                       className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-blue-400 focus:bg-white focus:outline-none" />
              </div>
              <p className="mt-1 text-xs text-slate-400">{hint}</p>
            </fieldset>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {appliedCount > 0
          ? `${appliedCount} filter${appliedCount === 1 ? '' : 's'} applied — ${resultCount} matching. Leave a box untouched to include everyone.`
          : 'Leave a box untouched to include everyone. Employees with no recorded date fall outside a date range.'}
      </p>
    </form>
  );
}

export default function LaunchFromMaster() {
  const [roles, setRoles] = useState([]);
  const [roleKey, setRoleKey] = useState('');
  const [cycle, setCycle] = useState('');
  const [startOn, setStartOn] = useState('');
  // Existing cycles for the chosen template, and who is already in the chosen
  // one. A cycle is not a stored record — it is DISTINCT cycle across pairs —
  // so "the cycles that exist" only ever means "the ones with pairs in them".
  const [cycleList, setCycleList] = useState([]);
  const [newCycle, setNewCycle] = useState(false);
  const [alreadyIn, setAlreadyIn] = useState(new Set());

  const [people, setPeople] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  // What the panel shows (draft) and what the list was last fetched with
  // (applied). results is that fetched list; null means no filter is applied
  // and the whole master is listed.
  const [draft, setDraft] = useState(NO_FILTERS);
  const [applied, setApplied] = useState(NO_FILTERS);
  const [results, setResults] = useState(null);
  const [applying, setApplying] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ locations: [], designations: [], companies: [], costCentres: [] });
  const [optionsError, setOptionsError] = useState('');
  const [picked, setPicked] = useState({});   // empCode -> { rmCode, bhCode }
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);

  const role = roles.find((r) => r.roleKey === roleKey);
  const isFeedback = role?.templateType === 'FEEDBACK';
  // HR-SPOC is routed per employee, so it gets a column — but only for
  // templates that actually run the stage. HR-HEAD and COTO are one person
  // each for the whole template and stay in Setup.
  const showSpoc = !isFeedback && Boolean(role?.hasHrSpocStage);

  // Anything the template asks for that ZingHR cannot supply is typed by hand.
  // Which columns those are is decided by lib/masterProfile, shared with the
  // launch API — two copies of that answer would drift, and HR would end up
  // typing into a box the server then overwrites.
  const editableFields = useMemo(
    () => editableProfileCols(role?.profileCols || []),
    [role],
  );

  useEffect(() => {
    fetch('/api/admin/roles').then((r) => r.json())
      .then((d) => setRoles(d.roles || []))
      .catch(() => setToast({ message: 'Could not load templates.', type: 'error' }));
  }, []);

  // Cycles belong to a template, so the list changes with it. Reset the chosen
  // cycle too — carrying "FY26-H1" across to a different template would offer
  // a cycle that has nothing to do with it.
  useEffect(() => {
    setCycle('');
    setNewCycle(false);
    setAlreadyIn(new Set());
    if (!roleKey) { setCycleList([]); return; }
    fetch(`/api/admin/cycles?roleKey=${encodeURIComponent(roleKey)}`)
      .then((r) => r.json())
      .then((d) => setCycleList(d.cycles || []))
      .catch(() => setCycleList([]));
  }, [roleKey]);

  // Who is already in the chosen cycle. Launching them again would create a
  // second pair with its own invite, and nothing would say so.
  useEffect(() => {
    if (!roleKey || !cycle.trim()) { setAlreadyIn(new Set()); return; }
    let cancelled = false;
    fetch(`/api/admin/pairs?roleKey=${encodeURIComponent(roleKey)}&cycle=${encodeURIComponent(cycle.trim())}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAlreadyIn(new Set((d.pairs || []).map((p) => p.empCode)));
      })
      .catch(() => { if (!cancelled) setAlreadyIn(new Set()); });
    return () => { cancelled = true; };
  }, [roleKey, cycle]);

  useEffect(() => {
    fetch('/api/admin/master/employees?picker=1')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => setPeople(d.employees || []))
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // The checkbox lists, exactly as /master offers them.
  useEffect(() => {
    fetch('/api/admin/master/filter-options')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then(setFilterOptions)
      .catch((e) => setOptionsError(e.message));
  }, []);

  // The portal runs the query, as it does for /master. Ticked people are kept
  // whatever the list shows next.
  const applyFilters = useCallback(async () => {
    const wanted = draft;
    if (countFilters(wanted) === 0) {
      setApplied(NO_FILTERS);
      setResults(null);
      return;
    }
    setApplying(true);
    try {
      const r = await fetch(`/api/admin/master/employees?${filterQuery(wanted)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResults(d.employees || []);
      setApplied(wanted);
    } catch (e) {
      setToast({ message: `Could not apply the filters: ${e.message}`, type: 'error' });
    } finally {
      setApplying(false);
    }
  }, [draft]);

  const clearFilters = useCallback(() => {
    setDraft(NO_FILTERS);
    setApplied(NO_FILTERS);
    setResults(null);
  }, []);

  const shown = results ?? people;

  function togglePick(code) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[code]) delete next[code];
      else next[code] = { rmCode: '', bhCode: '', hrSpocCode: '', profile: {} };
      return next;
    });
  }

  function setReviewer(code, field, personCode) {
    setPicked((prev) => ({ ...prev, [code]: { ...prev[code], [field]: personCode } }));
  }

  function setProfileField(code, key, value) {
    setPicked((prev) => ({
      ...prev,
      [code]: { ...prev[code], profile: { ...(prev[code].profile || {}), [key]: value } },
    }));
  }

  /** Copy one value into every selected row. These fields are usually the same
   *  for a whole intake — the entire sample sheet is Scheme "GET" — so filling
   *  25 boxes by hand would be the spreadsheet drudgery this screen replaces. */
  function applyToAll(key, value) {
    setPicked((prev) => {
      const next = { ...prev };
      for (const code of Object.keys(next)) {
        next[code] = { ...next[code], profile: { ...(next[code].profile || {}), [key]: value } };
      }
      return next;
    });
  }

  const pickedCodes = Object.keys(picked);
  const missingBh = isFeedback ? [] : pickedCodes.filter((c) => !picked[c].bhCode);
  const canLaunch = roleKey && cycle.trim() && pickedCodes.length > 0 && missingBh.length === 0 && !launching;

  // A date of today or earlier is not a schedule — the server treats it as an
  // immediate launch, and the screen has to say the same thing. Promising
  // "on or after today" while sending straight away is how HR ends up waiting
  // for an e-mail that already went.
  const todayStr = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local
  const scheduled = Boolean(startOn) && startOn > todayStr;

  async function launch() {
    if (!canLaunch) return;
    const when = scheduled
      ? `Reviewers will be e-mailed on or after ${startOn}.`
      : 'Reviewers will be e-mailed now.';
    if (!confirm(`Launch ${pickedCodes.length} assessment${pickedCodes.length === 1 ? '' : 's'} for ${cycle.trim()}?\n\n${when}`)) return;
    setLaunching(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/master/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleKey, cycle: cycle.trim(), startOn: startOn || null,
          rows: pickedCodes.map((empCode) => ({
            empCode,
            rmCode: picked[empCode].rmCode || null,
            bhCode: picked[empCode].bhCode || null,
            hrSpocCode: picked[empCode].hrSpocCode || null,
            profile: picked[empCode].profile || {},
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.createdRows) throw new Error(data.error || 'Launch failed');
      setResult(data);
      // Only the ones that worked are cleared, so a retry covers exactly the
      // rows that failed rather than the whole batch again.
      if (data.created > 0) {
        setPicked((prev) => {
          const next = { ...prev };
          for (const row of data.createdRows || []) delete next[row.empCode];
          return next;
        });
      }
      // Report what actually reached a reviewer, not just what was created —
      // "3 launched" with no e-mail sent is the thing HR needs to notice.
      const inv = data.invited || {};
      const mailed = (inv.selfGroupsEmailed || 0) + (inv.rmGroupsEmailed || 0) + (inv.bhGroupsEmailed || 0);
      const mailNote = scheduled ? ` — invites scheduled for ${startOn}`
                     : inv.timedOut ? ' — e-mails still sending, they will finish shortly'
                     : inv.error ? ` — but the e-mails FAILED: ${inv.error}`
                     : mailed ? ` — ${mailed} reviewer e-mail${mailed === 1 ? '' : 's'} sent`
                     // Launched, not scheduled, nothing sent and no error: the
                     // reviewers were already invited, or something filtered
                     // them out. Silence here is what sent HR to Cycle
                     // Management in the first place.
                     : ' — no e-mail was sent; check Cycle Management';
      setToast({
        message: `${data.created} launched${data.failed ? `, ${data.failed} failed` : ''}${mailNote}.`,
        type: data.failed ? 'error' : 'success',
      });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLaunching(false);
    }
  }

  return (
    <AdminLayout title="Launch from Employee Master">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800">Launch a cycle from the Employee Master</h1>
        <p className="mt-1 text-sm text-slate-500">
          No spreadsheet. Filter the master, tick the people, name their RM and BH.
        </p>
      </div>

      {/* 1 — what we are launching */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Template</span>
            <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}
                    className="min-w-[240px] rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose a template…</option>
              {roles.map((r) => (
                <option key={r.roleKey} value={r.roleKey}>
                  {r.roleLabel || r.roleKey} — {r.templateType}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Cycle</span>
            {newCycle || cycleList.length === 0 ? (
              <div className="flex items-center gap-2">
                <input
                  value={cycle} onChange={(e) => setCycle(e.target.value)}
                  placeholder="e.g. FY26-H1" autoFocus={newCycle}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {cycleList.length > 0 && (
                  <button type="button" onClick={() => { setNewCycle(false); setCycle(''); }}
                          className="text-xs text-slate-500 underline hover:text-slate-800">
                    pick existing
                  </button>
                )}
              </div>
            ) : (
              <select
                value={cycle}
                onChange={(e) => {
                  if (e.target.value === '__new__') { setNewCycle(true); setCycle(''); }
                  else setCycle(e.target.value);
                }}
                className="min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Choose a cycle…</option>
                {cycleList.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">＋ New cycle…</option>
              </select>
            )}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Start on <span className="font-normal text-slate-400">(optional)</span></span>
            <input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)}
                   className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
        {role && (
          <p className="mt-3 text-xs text-slate-500">
            {isFeedback
              ? 'Feedback template — employee-only. No RM or BH is needed; the employee’s own e-mail is used.'
              : `${role.templateType} template. Level 2 is required for every employee; Level 1 is optional and its stage is skipped when left blank.`}
            {role.includeSelf && ' Self-assessment is on, so each employee needs an e-mail on file.'}
            {showSpoc && ` After BH it goes to HR-SPOC${role.hrSpocDefaultName ? '' : ' — pick one per employee below'}, then HR-HEAD, then COTO.`}
          </p>
        )}
      </div>

      {/* 2 — choose people */}
      {loadError ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>The employee master could not be read.</strong> {loadError}
        </div>
      ) : (
        <div className="mt-5">
          <FilterPanel draft={draft} setDraft={setDraft} options={filterOptions}
                       appliedCount={countFilters(applied)} resultCount={shown.length}
                       applying={applying} onApply={applyFilters} onClear={clearFilters} />
          {optionsError && (
            <p className="mt-2 text-xs text-amber-700">
              The filter lists could not be loaded ({optionsError}). Name, On roll / Off roll and date filters still work.
            </p>
          )}

          <p className="mt-3 text-sm text-slate-600">
            {loading ? 'Loading the master…' : <><strong>{shown.length}</strong> of {people.length} shown</>}
            {alreadyIn.size > 0 && (
              <span className="ml-2 text-slate-500">
                · {alreadyIn.size} already in {cycle}
              </span>
            )}
          </p>

          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-left uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Designation</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.slice(0, 400).map((p) => {
                  const done = alreadyIn.has(p.employee_code);
                  return (
                    <tr key={p.employee_code}
                        className={done ? 'bg-slate-50 text-slate-400'
                                        : picked[p.employee_code] ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" disabled={done}
                               checked={Boolean(picked[p.employee_code])}
                               onChange={() => togglePick(p.employee_code)}
                               aria-label={done ? `${p.employee_name} is already in this cycle`
                                                : `Select ${p.employee_name}`} />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{p.employee_code}</td>
                      <td className="px-3 py-1.5 font-medium">
                        {p.employee_name}
                        {done && (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            already in {cycle}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{p.designation || '—'}</td>
                      <td className="px-3 py-1.5">{p.location || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length > 400 && (
              <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                Showing the first 400 of {shown.length}. Narrow the filters to see the rest.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 3 — reviewers for the chosen people */}
      {pickedCodes.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Selected — {pickedCodes.length} {pickedCodes.length === 1 ? 'employee' : 'employees'}
              {!isFeedback && missingBh.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {missingBh.length} still without a Level 2
                </span>
              )}
            </h2>
            <button onClick={() => setPicked({})} className="text-xs text-slate-500 underline hover:text-slate-800">
              Clear selection
            </button>
          </div>

          {editableFields.length > 0 && (
            <div className="border-b border-slate-100 bg-amber-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700">
                Fields this template asks for that ZingHR does not hold
                <span className="ml-2 font-normal text-slate-500">
                  — type once here to fill every selected row, then correct any exceptions in the table below.
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {editableFields.map((f) => (
                  <label key={f.key} className="text-xs">
                    <span className="mb-1 block font-medium text-slate-600">{f.label}</span>
                    <input
                      defaultValue=""
                      onChange={(e) => applyToAll(f.key, e.target.value)}
                      placeholder={`e.g. for all ${pickedCodes.length}`}
                      aria-label={`Set ${f.label} for every selected employee`}
                      className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  {!isFeedback && <th className="w-56 px-3 py-2">Level 1 <span className="font-normal normal-case text-slate-400">(optional)</span></th>}
                  {!isFeedback && <th className="w-56 px-3 py-2">Level 2 <span className="font-normal normal-case text-red-500">required</span></th>}
                  {showSpoc && (
                    <th className="w-56 px-3 py-2">
                      HR-SPOC{' '}
                      <span className="font-normal normal-case text-slate-400">
                        {role?.hrSpocDefaultName ? `(default: ${role.hrSpocDefaultName})` : '(per employee)'}
                      </span>
                    </th>
                  )}
                  {editableFields.map((f) => (
                    <th key={f.key} className="w-40 px-3 py-2 text-amber-800">{f.label}</th>
                  ))}
                  <th className="w-10 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pickedCodes.map((code) => {
                  const p = people.find((x) => x.employee_code === code);
                  return (
                    <tr key={code} className="align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{p?.employee_name || code}</div>
                        <div className="text-[11px] text-slate-500">
                          <span className="font-mono">{code}</span>
                          {p?.designation ? ` · ${p.designation}` : ''}
                        </div>
                      </td>
                      {!isFeedback && (
                        <td className="px-3 py-2">
                          <PersonPicker people={people} value={picked[code].rmCode}
                                        onChange={(v) => setReviewer(code, 'rmCode', v)}
                                        placeholder="Type 2+ letters…" ariaLabel={`Level 1 for ${p?.employee_name || code}`} />
                        </td>
                      )}
                      {!isFeedback && (
                        <td className="px-3 py-2">
                          <PersonPicker people={people} value={picked[code].bhCode}
                                        onChange={(v) => setReviewer(code, 'bhCode', v)}
                                        placeholder="Type 2+ letters…" ariaLabel={`Level 2 for ${p?.employee_name || code}`} />
                        </td>
                      )}
                      {showSpoc && (
                        <td className="px-3 py-2">
                          <PersonPicker people={people} value={picked[code].hrSpocCode}
                                        onChange={(v) => setReviewer(code, 'hrSpocCode', v)}
                                        placeholder={role?.hrSpocDefaultName ? 'Leave blank for default' : 'Type 2+ letters…'}
                                        ariaLabel={`HR-SPOC for ${p?.employee_name || code}`} />
                        </td>
                      )}
                      {editableFields.map((f) => (
                        <td key={f.key} className="px-3 py-2">
                          <input
                            value={picked[code].profile?.[f.key] ?? ''}
                            onChange={(e) => setProfileField(code, f.key, e.target.value)}
                            aria-label={`${f.label} for ${p?.employee_name || code}`}
                            className="w-full rounded-lg border border-slate-200 bg-amber-50/40 px-2 py-1.5 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <button onClick={() => togglePick(code)} className="text-slate-400 hover:text-red-600" title="Remove">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {!roleKey ? 'Choose a template first.'
                : !cycle.trim() ? 'Give the cycle a name.'
                : missingBh.length > 0 ? `${missingBh.length} employee${missingBh.length === 1 ? '' : 's'} still need a Level 2 reviewer — no appraisal can run without one.`
                : scheduled
                  ? `Ready. Reviewers will be e-mailed on or after ${startOn}.`
                  : 'Ready. Reviewers are e-mailed as soon as you launch.'}
            </p>
            <button
              onClick={launch}
              disabled={!canLaunch}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {launching ? 'Launching…' : `Launch ${pickedCodes.length} assessment${pickedCodes.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-semibold text-slate-800">
            {result.created} launched{result.failed ? `, ${result.failed} failed` : ''}.
          </p>
          {result.failedRows?.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-red-700">
              {result.failedRows.map((f) => (
                <li key={f.empCode}><strong>{f.empName}</strong> ({f.empCode}) — {f.error}</li>
              ))}
            </ul>
          )}
          {result.failedRows?.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              The failed rows are still selected above — fix and launch again.
            </p>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export async function getServerSideProps({ req }) {
  return getPageAuth(req);
}
