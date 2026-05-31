/**
 * AssessmentForm.js
 * Dynamic assessment form rendered from Google Sheet headers.
 *
 * RM form  – fill ratings + narrative → submit
 * BH form  – pre-filled with RM values → amend or submit as-is
 *
 * No comment boxes for ratings (blue collar / trainee design).
 * Headers are fully dynamic from the sheet.
 */
import { useState } from 'react';
import { buildColumnMap, COLUMN_TYPES, colLabel, getQuestionGroups } from '../lib/columnMap';
import clsx from 'clsx';

const RATING_OPTIONS = [
  { value: '', label: '— Select —' },
  { value: '1', label: '1 – Poor' },
  { value: '2', label: '2 – Below Average' },
  { value: '3', label: '3 – Average' },
  { value: '4', label: '4 – Good' },
  { value: '5', label: '5 – Excellent' },
];

const RATING_COLORS = ['', 'text-red-600', 'text-orange-500', 'text-yellow-600', 'text-blue-600', 'text-green-600'];

export default function AssessmentForm({ formType, rm, bh, headers, onSubmit, isLocked, isViewOnly }) {
  const isBH = formType === 'BH';

  const { groups } = buildColumnMap(headers || []);
  const ratingCols   = groups[COLUMN_TYPES.RATING]    || [];
  const narrativeCols= groups[COLUMN_TYPES.NARRATIVE]  || [];
  const numberCols   = groups[COLUMN_TYPES.NUMBER]     || [];
  const dateCols     = groups[COLUMN_TYPES.DATE]       || [];
  const questionGroups = getQuestionGroups(ratingCols);

  // BH is pre-filled with RM values; RM starts blank
  const sourceForPrefill = isBH ? rm : null;
  const existingValues   = isBH ? bh  : rm;

  const initValues = () => {
    const v = {};
    [...narrativeCols, ...numberCols, ...dateCols, ...ratingCols].forEach((col) => {
      // Use existing BH/RM saved value if present, otherwise pre-fill from RM for BH
      v[col] = existingValues?.[col] || sourceForPrefill?.[col] || '';
    });
    return v;
  };

  const [values, setValues]     = useState(initValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  const disabled = isLocked || isViewOnly || submitting;

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (isBH && !rm) {
    return (
      <div className="card text-center text-gray-500 py-8">
        BH row not available yet — RM must submit first.
      </div>
    );
  }

  const displayRow = (isBH ? bh : rm) || rm;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">

      {/* ── Employee identity strip ── */}
      <div className="bg-slate-800 text-white rounded-lg px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="font-bold text-lg">{displayRow?.EMP_CODE}</span>
          <span className="font-semibold">{displayRow?.EMP_NAME}</span>
          <span className="text-slate-300">{displayRow?.ROLE}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-300">{displayRow?.CYCLE}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 mt-1 text-xs text-slate-400">
          <span>RM: {displayRow?.RM_NAME}</span>
          <span>BH: {displayRow?.BH_NAME}</span>
          <span className="font-mono">{displayRow?.ASSESSMENT_PAIR_ID}</span>
        </div>
      </div>

      {/* ── Status banners ── */}
      {isLocked && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-sm text-red-700">
          This assessment is <strong>locked</strong> and cannot be edited.
        </div>
      )}
      {isBH && !isLocked && !isViewOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded px-4 py-2 text-sm text-blue-700">
          Pre-filled from RM submission. Amend any rating if needed, then submit.
        </div>
      )}

      {/* ── Narrative fields ── */}
      {narrativeCols.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {isBH ? 'BH – ' : ''}Narrative &amp; Recommendations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {narrativeCols.map((col) => (
              <div key={col}>
                <label className="form-label">{colLabel(col)}</label>
                <textarea
                  name={col}
                  value={values[col] || ''}
                  onChange={handleChange}
                  disabled={disabled}
                  rows={3}
                  className={`form-textarea text-sm ${disabled ? 'field-locked' : ''}`}
                  placeholder={disabled ? '' : `Enter ${colLabel(col).toLowerCase()}…`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Number fields ── */}
      {numberCols.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {isBH ? 'BH – ' : ''}Numeric Fields
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {numberCols.map((col) => (
              <div key={col}>
                <label className="form-label">{colLabel(col)}</label>
                <input
                  type="number"
                  name={col}
                  value={values[col] || ''}
                  onChange={handleChange}
                  disabled={disabled}
                  className={clsx(
                    'w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400',
                    disabled ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-300'
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Date fields ── */}
      {dateCols.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {isBH ? 'BH – ' : ''}Date Fields
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dateCols.map((col) => (
              <div key={col}>
                <label className="form-label">{colLabel(col)}</label>
                <input
                  type="date"
                  name={col}
                  value={values[col] || ''}
                  onChange={handleChange}
                  disabled={disabled}
                  className={clsx(
                    'w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400',
                    disabled ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-300'
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rating table ── */}
      {questionGroups.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {isBH ? 'BH – ' : ''}Assessment Ratings
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-3 py-2 w-10">#</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-3 py-2">Parameter</th>
                {isBH && (
                  <th className="text-center text-xs font-semibold text-blue-600 uppercase px-3 py-2 w-28">RM Rating</th>
                )}
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-3 py-2 w-44">
                  {isBH ? 'BH Rating' : 'Rating'}
                </th>
              </tr>
            </thead>
            <tbody>
              {questionGroups.map((q, idx) => {
                const rmVal = rm?.[q.ratingKey];
                const rmNum = parseInt(rmVal);
                return (
                  <tr key={q.ratingKey} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{q.num}</td>
                    <td className="px-3 py-2 font-medium text-gray-700">{colLabel(q.ratingKey)}</td>
                    {isBH && (
                      <td className="px-3 py-2 text-center">
                        {rmVal ? (
                          <span className={`font-bold ${RATING_COLORS[rmNum] || 'text-gray-600'}`}>
                            {rmVal} / 5
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <select
                        name={q.ratingKey}
                        value={values[q.ratingKey] || ''}
                        onChange={handleChange}
                        disabled={disabled}
                        className={clsx(
                          'w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400',
                          disabled ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-300'
                        )}
                      >
                        {RATING_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Submit ── */}
      {!isViewOnly && (
        <div className="flex items-center gap-4 pt-1">
          {!isLocked ? (
            <button type="submit" disabled={disabled}
              className={clsx(
                'btn text-white px-6 py-2.5 font-semibold rounded',
                isBH
                  ? 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
              )}
            >
              {submitting
                ? 'Submitting…'
                : isBH
                ? 'Submit BH Assessment & Finalize'
                : 'Submit RM Assessment'}
            </button>
          ) : (
            <span className="text-sm text-gray-500 italic">Submitted and locked.</span>
          )}
          {error && <span className="text-red-600 text-sm">{error}</span>}
        </div>
      )}
    </form>
  );
}
