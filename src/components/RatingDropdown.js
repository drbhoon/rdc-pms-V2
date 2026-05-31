/**
 * RatingDropdown.js
 * 5-point Richter scale dropdown for assessment rating fields.
 */

const RATING_OPTIONS = [
  { value: '',  label: '— Select —' },
  { value: '1', label: '1 – Poor' },
  { value: '2', label: '2 – Below Average' },
  { value: '3', label: '3 – Average' },
  { value: '4', label: '4 – Good' },
  { value: '5', label: '5 – Excellent' },
];

export default function RatingDropdown({ name, value, onChange, disabled, label }) {
  return (
    <div>
      {label && <label className="form-label">{label}</label>}
      <select
        name={name}
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        className={`form-select ${disabled ? 'field-locked' : ''}`}
      >
        {RATING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Display a rating value as a colored badge. */
export function RatingDisplay({ value }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>;
  const num = parseInt(value);
  const colors = ['', 'text-red-600', 'text-orange-500', 'text-yellow-600', 'text-blue-600', 'text-green-600'];
  return (
    <span className={`font-bold text-base ${colors[num] || 'text-gray-600'}`}>
      {value} / 5
    </span>
  );
}
