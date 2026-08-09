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
              <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} className="mt-0.5" />
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

  useEffect(() => {
    fetch('/api/admin/roles').then((r) => r.json())
      .then((d) => setRoles(d.roles || []))
      .catch(() => setToast({ message: 'Could not load templates.', type: 'error' }));
  }, []);

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
      else next[code] = { rmCode: '', bhCode: '' };
      return next;
    });
  }

  function setReviewer(code, field, personCode) {
    setPicked((prev) => ({ ...prev, [code]: { ...prev[code], [field]: personCode } }));
  }

  const pickedCodes = Object.keys(picked);
  const missingBh = isFeedback ? [] : pickedCodes.filter((c) => !picked[c].bhCode);
  const canLaunch = roleKey && cycle.trim() && pickedCodes.length > 0 && missingBh.length === 0 && !launching;

  async function launch() {
    if (!canLaunch) return;
    if (!confirm(`Launch ${pickedCodes.length} assessment${pickedCodes.length === 1 ? '' : 's'} for ${cycle.trim()}?\n\nReviewers will be e-mailed on the next invite run.`)) return;
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
      setToast({
        message: `${data.created} launched${data.failed ? `, ${data.failed} failed` : ''}.`,
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
            <input value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="e.g. FY26-H1"
                   className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
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
              : `${role.templateType} template. BH is required for every employee; RM is optional and its stage is skipped when left blank.`}
            {role.includeSelf && ' Self-assessment is on, so each employee needs an e-mail on file.'}
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
                {filtered.slice(0, 400).map((p) => (
                  <tr key={p.employee_code} className={picked[p.employee_code] ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={Boolean(picked[p.employee_code])}
                             onChange={() => togglePick(p.employee_code)}
                             aria-label={`Select ${p.employee_name}`} />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{p.employee_code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{p.employee_name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{p.designation || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{p.location || '—'}</td>
                  </tr>
                ))}
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
                  {missingBh.length} still without a BH
                </span>
              )}
            </h2>
            <button onClick={() => setPicked({})} className="text-xs text-slate-500 underline hover:text-slate-800">
              Clear selection
            </button>
          </div>

          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  {!isFeedback && <th className="w-64 px-3 py-2">RM <span className="font-normal normal-case text-slate-400">(optional)</span></th>}
                  {!isFeedback && <th className="w-64 px-3 py-2">BH <span className="font-normal normal-case text-red-500">required</span></th>}
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
                                        placeholder="Type 2+ letters…" ariaLabel={`RM for ${p?.employee_name || code}`} />
                        </td>
                      )}
                      {!isFeedback && (
                        <td className="px-3 py-2">
                          <PersonPicker people={people} value={picked[code].bhCode}
                                        onChange={(v) => setReviewer(code, 'bhCode', v)}
                                        placeholder="Type 2+ letters…" ariaLabel={`BH for ${p?.employee_name || code}`} />
                        </td>
                      )}
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
                : missingBh.length > 0 ? `${missingBh.length} employee${missingBh.length === 1 ? '' : 's'} still need a BH — no appraisal can run without one.`
                : 'Ready. Reviewers are e-mailed on the next invite run, not immediately.'}
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
