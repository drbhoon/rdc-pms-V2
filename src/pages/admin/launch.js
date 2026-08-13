/**
 * admin/launch.js — Launch a cycle from the shared employee master.
 *
 * Replaces the upload-a-spreadsheet flow: pick a template, filter the master,
 * tick the people, name their RM and BH, launch.
 *
 * The whole master is loaded once (about 160 KB for 900-odd people) and every
 * filter and lookup runs against that copy. At this size a request per
 * keystroke would only add lag and race conditions.
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

/** Distinct, sorted values of one field across the master. */
function distinct(rows, field) {
  return [...new Set(rows.map((r) => r[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function FacetBox({ label, options, selected, onToggle, onClear }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matches = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
    // Keep ticked values visible even when the search would hide them.
    const pinned = options.filter((o) => selected.includes(o) && !matches.includes(o));
    return [...pinned, ...matches];
  }, [q, options, selected]);

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
        {selected.length > 0
          ? <button onClick={onClear} className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-200">{selected.length} ✕</button>
          : <span className="text-[11px] text-slate-400">{options.length}</span>}
      </div>
      <div className="px-2 pt-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
               className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:border-blue-400 focus:bg-white focus:outline-none" />
      </div>
      <ul className="mt-1 max-h-40 overflow-y-auto px-1 pb-1 text-xs">
        {shown.length === 0 && <li className="px-2 py-2 text-center text-slate-400">No match</li>}
        {shown.map((o) => (
          <li key={o}>
            <label className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1 ${selected.includes(o) ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-700'}`}>
              {/* Explicit name: the wrapping <label> alone left these
                  announced as bare "on" to assistive tech and to tooling. */}
              <input type="checkbox" aria-label={`${label}: ${o}`}
                     checked={selected.includes(o)} onChange={() => onToggle(o)} className="mt-0.5" />
              <span className="leading-snug">{o}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
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

  const [search, setSearch] = useState('');
  const [facets, setFacets] = useState({ designation: [], location: [], company: [] });
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

  const options = useMemo(() => ({
    designation: distinct(people, 'designation'),
    location:    distinct(people, 'location'),
    company:     distinct(people, 'company'),
  }), [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !(`${p.employee_name} ${p.employee_code}`.toLowerCase().includes(q))) return false;
      for (const key of ['designation', 'location', 'company']) {
        if (facets[key].length && !facets[key].includes(p[key])) return false;
      }
      return true;
    });
  }, [people, search, facets]);

  const toggleFacet = useCallback((key, value) => {
    setFacets((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }));
  }, []);

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
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="min-w-[240px] flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Search name or code</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Gurumurthy or G00064"
                     className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <p className="text-sm text-slate-600">
              {loading ? 'Loading the master…' : <><strong>{filtered.length}</strong> of {people.length} shown</>}
              {alreadyIn.size > 0 && (
                <span className="ml-2 text-slate-500">
                  · {alreadyIn.size} already in {cycle}
                </span>
              )}
            </p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {['designation', 'location', 'company'].map((key) => (
              <FacetBox
                key={key}
                label={key === 'company' ? 'Company' : key[0].toUpperCase() + key.slice(1)}
                options={options[key]}
                selected={facets[key]}
                onToggle={(v) => toggleFacet(key, v)}
                onClear={() => setFacets((p) => ({ ...p, [key]: [] }))}
              />
            ))}
          </div>

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
                {filtered.slice(0, 400).map((p) => {
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
            {filtered.length > 400 && (
              <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                Showing the first 400 of {filtered.length}. Narrow the filters to see the rest.
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
