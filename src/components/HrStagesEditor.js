/**
 * HrStagesEditor — controlled editor for the three V2 commenter stages
 * (HR_SPOC / HR_HEAD / COTO). Manages, per role: a routing name + email and
 * a small list of fields the commenter fills ({ key, label, fieldType }).
 *
 * Value shape (all keys optional):
 *   {
 *     hrSpocName, hrSpocEmail, hrSpocFields: [{key,label,fieldType,options?}],
 *     hrHeadName, hrHeadEmail, hrHeadFields: [...],
 *     cotoName,   cotoEmail,   cotoFields:   [...],
 *   }
 *
 * A stage is "active" iff it has ≥1 field AND a routing email — surfaced in the
 * activation summary so HR sees exactly which stages will run.
 */
import { useState } from 'react';

const FIELD_TYPES = ['narrative', 'rating', 'select', 'number', 'date'];
const FIELD_TYPE_LABEL = {
  narrative: 'Text', rating: 'Rating (1–5)', select: 'Select (options)',
  number: 'Number', date: 'Date',
};

const STAGES = [
  { key: 'hrSpoc', label: 'HR-SPOC', accent: 'teal',   nameK: 'hrSpocName', emailK: 'hrSpocEmail', fieldsK: 'hrSpocFields' },
  { key: 'hrHead', label: 'HR-HEAD', accent: 'violet', nameK: 'hrHeadName', emailK: 'hrHeadEmail', fieldsK: 'hrHeadFields' },
  { key: 'coto',   label: 'COTO',    accent: 'rose',   nameK: 'cotoName',   emailK: 'cotoEmail',   fieldsK: 'cotoFields' },
];

const ACCENT_CLS = {
  teal:   'border-teal-200 bg-teal-50/40',
  violet: 'border-violet-200 bg-violet-50/40',
  rose:   'border-rose-200 bg-rose-50/40',
};

// Default suggestion seeded into the COTO field editor when it's empty.
const COTO_SUGGESTION = [
  { key: 'COTO_APPROVAL', label: 'COTO Approval', fieldType: 'select', options: ['Yes', 'No', 'Hold'] },
  { key: 'COTO_COMMENTS', label: 'COTO Comments', fieldType: 'narrative' },
];

function slugKey(s) {
  return String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function stageIsActive(value, stage) {
  const fields = value[stage.fieldsK];
  const email = value[stage.emailK];
  return Array.isArray(fields) && fields.length > 0 && !!(email && String(email).trim());
}

export default function HrStagesEditor({ value, onChange }) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-slate-700">HR Review Stages (after BH)</div>
      <p className="text-xs text-slate-500 -mt-2">
        Optional commenter stages. A stage runs only when it has at least one field <em>and</em> a routing email.
        These reviewers see the candidate's Self/RM/BH ratings read-only and fill only their own fields.
      </p>
      {STAGES.map((stage) => (
        <StageCard key={stage.key} stage={stage} v={v} set={set} />
      ))}
    </div>
  );
}

function StageCard({ stage, v, set }) {
  const fields = Array.isArray(v[stage.fieldsK]) ? v[stage.fieldsK] : [];
  const active = stageIsActive(v, stage);
  const [draftKey, setDraftKey] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftType, setDraftType] = useState('narrative');

  function updateField(idx, patch) {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    set({ [stage.fieldsK]: next });
  }
  function removeField(idx) {
    set({ [stage.fieldsK]: fields.filter((_, i) => i !== idx) });
  }
  function addField() {
    const label = draftLabel.trim();
    const key = slugKey(draftKey || draftLabel);
    if (!key || !label) return;
    if (fields.some((f) => f.key === key)) return;
    const f = { key, label, fieldType: draftType };
    if (draftType === 'select') f.options = ['Yes', 'No', 'Hold'];
    set({ [stage.fieldsK]: [...fields, f] });
    setDraftKey(''); setDraftLabel(''); setDraftType('narrative');
  }
  function seedCoto() {
    set({ [stage.fieldsK]: COTO_SUGGESTION });
  }

  const emailVal = v[stage.emailK] || '';
  const emailMissing = fields.length > 0 && !String(emailVal).trim();

  return (
    <div className={`rounded-xl border p-4 ${ACCENT_CLS[stage.accent]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-700">{stage.label}</div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {active ? 'Active' : 'Off'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{stage.label} Name</label>
          <input value={v[stage.nameK] || ''} onChange={(e) => set({ [stage.nameK]: e.target.value })}
            placeholder="e.g. Asha Rao"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {stage.label} Email {fields.length > 0 && <span className="text-red-500">*</span>}
          </label>
          <input value={emailVal} onChange={(e) => set({ [stage.emailK]: e.target.value })}
            placeholder="name@rdc.in"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${emailMissing ? 'border-red-400 focus:ring-red-500/20' : 'border-slate-300 focus:border-slate-500 focus:ring-slate-500/20'}`} />
          {emailMissing && <p className="text-xs text-red-600 mt-1">Required — this stage has fields but no email, so launches will fail.</p>}
        </div>
      </div>

      {/* Field list */}
      <div className="space-y-2">
        {fields.length === 0 && (
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>No fields yet — this stage will be skipped.</span>
            {stage.key === 'coto' && (
              <button type="button" onClick={seedCoto} className="text-rose-600 hover:text-rose-800 font-medium">
                + Add suggested COTO fields
              </button>
            )}
          </div>
        )}
        {fields.map((f, idx) => (
          <div key={f.key} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
            <span className="font-mono text-xs text-slate-400 w-40 truncate" title={f.key}>{f.key}</span>
            <input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })}
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
            <select value={f.fieldType} onChange={(e) => updateField(idx, { fieldType: e.target.value })}
              className="rounded border border-slate-200 px-2 py-1 text-xs bg-white">
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
            </select>
            <button type="button" onClick={() => removeField(idx)} className="text-red-400 hover:text-red-600 text-sm px-1" title="Remove field">✕</button>
          </div>
        ))}
      </div>

      {/* Add field row */}
      <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-slate-200/60">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Field key</label>
          <input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="HR_SPOC_COMMENT"
            className="rounded border border-slate-300 px-2 py-1 text-xs font-mono w-44 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Label</label>
          <input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="HR-SPOC Comment"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Type</label>
          <select value={draftType} onChange={(e) => setDraftType(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs bg-white">
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <button type="button" onClick={addField} disabled={!draftLabel.trim()}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          + Add Field
        </button>
      </div>
    </div>
  );
}

// Small read-only activation summary used near the top of a template view.
export function ActivationSummary({ includeSelf, value }) {
  const v = value || {};
  const stages = [
    { label: 'Self', on: !!includeSelf, warn: false },
    { label: 'RM',   on: true,  warn: false },
    { label: 'BH',   on: true,  warn: false },
    ...STAGES.map((s) => {
      const hasFields = Array.isArray(v[s.fieldsK]) && v[s.fieldsK].length > 0;
      const hasEmail = !!(v[s.emailK] && String(v[s.emailK]).trim());
      return { label: s.label, on: hasFields && hasEmail, warn: hasFields && !hasEmail };
    }),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 mr-1">Pipeline:</span>
      {stages.map((s, i) => (
        <span key={s.label} className="flex items-center gap-2">
          {i > 0 && <span className="text-slate-300">→</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            s.warn ? 'bg-amber-100 text-amber-800'
            : s.on ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-400 line-through'
          }`} title={s.warn ? 'Has fields but no routing email — fix before launching' : ''}>
            {s.label}{s.warn ? ' ⚠' : s.on ? '' : ''}
          </span>
        </span>
      ))}
    </div>
  );
}
