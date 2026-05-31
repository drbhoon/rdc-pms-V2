/**
 * columnMap.js
 * Parses a Google Sheet header row and classifies columns by type.
 *
 * All headers come from the actual Google Sheet – nothing is hardcoded.
 * Only a small set of system fields are added by the app for workflow tracking.
 *
 *   IDENTITY  : EMP_CODE, EMP_NAME, ROLE, CYCLE, ROW_TYPE, ASSESSMENT_PAIR_ID
 *   NARRATIVE : RECOMMENDATION, COMMENTS, GROWTH_POTENTIAL, KEY_REMARKS
 *               + any header containing "Recommendation" / "Recommend" keyword
 *   ROUTING   : RM_NAME, RM_EMAIL, BH_NAME, BH_EMAIL
 *   RATING    : headers matching /Q\d+_RATING/i  OR  starting with a number ("1. ...", "2. ...")
 *   SYSTEM    : STATUS, LOCK_STATUS, SELECTION_FLAG, SELECTED_BY, SELECTED_ON,
 *               PARENT_RM_ROW, RM_SUBMITTED_ON, BH_SUBMITTED_ON,
 *               LAST_UPDATED_BY, LAST_UPDATED_ON
 *   OTHER     : any other column the sheet contains (shown in template preview only)
 */

export const COLUMN_TYPES = {
  IDENTITY:  'identity',
  NARRATIVE: 'narrative',
  ROUTING:   'routing',
  RATING:    'rating',
  NUMBER:    'number',
  DATE:      'date',
  SYSTEM:    'system',
  OTHER:     'other',
};

const IDENTITY_COLS = new Set([
  'EMP_CODE', 'EMP_NAME', 'ROLE', 'CYCLE', 'ROW_TYPE', 'ASSESSMENT_PAIR_ID',
]);

const NARRATIVE_COLS = new Set([
  'RECOMMENDATION', 'COMMENTS', 'GROWTH_POTENTIAL', 'KEY_REMARKS',
]);

const ROUTING_COLS = new Set([
  'RM_NAME', 'RM_EMAIL', 'BH_NAME', 'BH_EMAIL',
]);

const SYSTEM_COLS = new Set([
  'STATUS', 'LOCK_STATUS', 'SELECTION_FLAG', 'SELECTED_BY', 'SELECTED_ON',
  'PARENT_RM_ROW', 'RM_SUBMITTED_ON', 'BH_SUBMITTED_ON',
  'LAST_UPDATED_BY', 'LAST_UPDATED_ON',
]);

/**
 * Classifies a single column header.
 * @param {string} header
 * @returns {string} one of COLUMN_TYPES
 */
export function classifyColumn(header) {
  const h = header.trim().toUpperCase();
  if (IDENTITY_COLS.has(h)) return COLUMN_TYPES.IDENTITY;
  if (NARRATIVE_COLS.has(h)) return COLUMN_TYPES.NARRATIVE;
  if (ROUTING_COLS.has(h)) return COLUMN_TYPES.ROUTING;
  if (SYSTEM_COLS.has(h)) return COLUMN_TYPES.SYSTEM;
  // Code-style rating keys: Q1_RATING, Q2_RATING …
  if (/^Q\d+_RATING$/i.test(h)) return COLUMN_TYPES.RATING;
  // Numbered questions pulled directly from the sheet: "1. Knowledge of Job…", "2) Quality…"
  if (/^\d+[\.\)]\s/.test(h)) return COLUMN_TYPES.RATING;
  // Date columns by keyword
  if (/\b(DATE|DOJ|DOB|JOINING|EXPIR[EY]?S?|BORN|SINCE)\b/.test(h)) return COLUMN_TYPES.DATE;
  // Number columns by keyword (non-rating numeric fields)
  if (/\b(STIPEND|SALARY|AMOUNT|VOLUME|COUNT|CAPACITY|STRENGTH|NUMBER|NO\.?)\b/.test(h)) return COLUMN_TYPES.NUMBER;
  // Recommendation / narrative columns identified by keyword
  if (/\bRECOMMEND(ATION)?\b/.test(h)) return COLUMN_TYPES.NARRATIVE;
  return COLUMN_TYPES.OTHER;
}

/**
 * Builds a column map from a header row array.
 * Returns { colName: colIndex (0-based) } and classified groups.
 *
 * @param {string[]} headers  e.g. ['EMP_CODE', 'EMP_NAME', ...]
 * @returns {{
 *   indexMap: Record<string, number>,   // header → 0-based col index
 *   groups: Record<string, string[]>,   // type → [header, ...]
 *   headers: string[]
 * }}
 */
export function buildColumnMap(headers) {
  const indexMap = {};
  const groups = {
    [COLUMN_TYPES.IDENTITY]:  [],
    [COLUMN_TYPES.NARRATIVE]: [],
    [COLUMN_TYPES.ROUTING]:   [],
    [COLUMN_TYPES.RATING]:    [],
    [COLUMN_TYPES.NUMBER]:    [],
    [COLUMN_TYPES.DATE]:      [],
    [COLUMN_TYPES.SYSTEM]:    [],
    [COLUMN_TYPES.OTHER]:     [],
  };

  headers.forEach((h, i) => {
    const key = h.trim().toUpperCase();
    indexMap[key] = i;
    const type = classifyColumn(h);
    groups[type].push(key);
  });

  return { indexMap, groups, headers };
}

/**
 * Converts a sheet row array to a named object using the column map.
 * @param {string[]} rowValues
 * @param {Record<string, number>} indexMap
 * @returns {Record<string, string>}
 */
export function rowToObject(rowValues, indexMap) {
  const obj = {};
  for (const [key, idx] of Object.entries(indexMap)) {
    obj[key] = rowValues[idx] ?? '';
  }
  return obj;
}

/**
 * Converts a named object back to a row array using the column map.
 * Fills gaps with empty strings.
 * @param {Record<string, string>} obj
 * @param {Record<string, number>} indexMap
 * @param {number} totalCols
 * @returns {string[]}
 */
export function objectToRow(obj, indexMap, totalCols) {
  const row = new Array(totalCols).fill('');
  for (const [key, value] of Object.entries(obj)) {
    const idx = indexMap[key.toUpperCase()];
    if (idx !== undefined) {
      row[idx] = value ?? '';
    }
  }
  return row;
}

/**
 * Returns a human-readable label from a column key.
 *   Code-style keys (no spaces):  "Q1_RATING"                    → "Q1 Rating"
 *   Long sheet headers (has spaces): "1. KNOWLEDGE OF JOB: (…)"  → "1. Knowledge Of Job: (…)"
 * @param {string} key
 * @returns {string}
 */
export function colLabel(key) {
  if (!key.includes(' ')) {
    // Code-style: replace underscores and title-case
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Long description stored in uppercase from the sheet – convert to Title Case
  return key.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns rating question metadata from the rating columns.
 * Handles both code-style keys (Q1_RATING) and full sheet headers ("1. Knowledge of Job…").
 * @param {string[]} ratingCols
 * @returns {{ num: string, ratingKey: string }[]}
 */
export function getQuestionGroups(ratingCols) {
  return ratingCols.map((r) => {
    // Code-style: Q1_RATING
    const qMatch = r.match(/^Q(\d+)_RATING$/i);
    if (qMatch) return { num: qMatch[1], ratingKey: r };
    // Numbered description: "1. Knowledge of Job…" or "14) Potential…"
    const numMatch = r.match(/^(\d+)[\.\)]/);
    return { num: numMatch?.[1] || '?', ratingKey: r };
  });
}
