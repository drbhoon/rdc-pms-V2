/**
 * mockStore.js
 * In-memory data store for MOCK_MODE (no Google credentials needed).
 *
 * Simulates a Google Sheet with realistic sample data for testing.
 * Data is reset on server restart (expected for dev/test).
 *
 * Structure mirrors the real sheet: each entry in mockStore.rows
 * represents a row in the DATA tab as a named object.
 */

import { format } from 'date-fns';

// ── Sample headers (same order as recommended column layout) ──────────────
export const MOCK_HEADERS = [
  // Identity
  'EMP_CODE', 'EMP_NAME', 'ROLE', 'CYCLE', 'ROW_TYPE', 'ASSESSMENT_PAIR_ID',
  // Narrative (near front for HR readability)
  'RECOMMENDATION', 'COMMENTS', 'GROWTH_POTENTIAL', 'KEY_REMARKS',
  // Ratings Q1–Q5 (no comment boxes – blue collar / trainee design)
  'Q1_RATING', 'Q2_RATING', 'Q3_RATING', 'Q4_RATING', 'Q5_RATING',
  // Routing
  'RM_NAME', 'RM_EMAIL', 'BH_NAME', 'BH_EMAIL',
  // System / workflow
  'STATUS', 'LOCK_STATUS', 'SELECTION_FLAG', 'SELECTED_BY', 'SELECTED_ON',
  'PARENT_RM_ROW', 'RM_SUBMITTED_ON', 'BH_SUBMITTED_ON',
  'LAST_UPDATED_BY', 'LAST_UPDATED_ON',
];

const now = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");

// ── Sample employees for each role ────────────────────────────────────────
const SAMPLE_EMPLOYEES = {
  PI: [
    { EMP_CODE: 'EMP001', EMP_NAME: 'Rajesh Kumar',    RM_NAME: 'Suresh Sharma', RM_EMAIL: 'suresh@rdcconcrete.com', BH_NAME: 'Pradeep Gupta', BH_EMAIL: 'pradeep@rdcconcrete.com' },
    { EMP_CODE: 'EMP002', EMP_NAME: 'Anil Verma',      RM_NAME: 'Suresh Sharma', RM_EMAIL: 'suresh@rdcconcrete.com', BH_NAME: 'Pradeep Gupta', BH_EMAIL: 'pradeep@rdcconcrete.com' },
    { EMP_CODE: 'EMP003', EMP_NAME: 'Meena Patel',     RM_NAME: 'Kavita Singh',  RM_EMAIL: 'kavita@rdcconcrete.com', BH_NAME: 'Pradeep Gupta', BH_EMAIL: 'pradeep@rdcconcrete.com' },
  ],
  GET: [
    { EMP_CODE: 'T001',   EMP_NAME: 'Sanjay Mishra',   RM_NAME: 'Ravi Kumar',    RM_EMAIL: 'ravi@rdcconcrete.com',   BH_NAME: 'Nisha Rao',    BH_EMAIL: 'nisha@rdcconcrete.com' },
    { EMP_CODE: 'T002',   EMP_NAME: 'Priya Sharma',    RM_NAME: 'Ravi Kumar',    RM_EMAIL: 'ravi@rdcconcrete.com',   BH_NAME: 'Nisha Rao',    BH_EMAIL: 'nisha@rdcconcrete.com' },
    { EMP_CODE: 'T003',   EMP_NAME: 'Deepak Singh',    RM_NAME: 'Mohan Das',     RM_EMAIL: 'mohan@rdcconcrete.com',  BH_NAME: 'Nisha Rao',    BH_EMAIL: 'nisha@rdcconcrete.com' },
  ],
  DET: [
    { EMP_CODE: 'D001',   EMP_NAME: 'Rohit Yadav',     RM_NAME: 'Anjali Mehta',  RM_EMAIL: 'anjali@rdcconcrete.com', BH_NAME: 'Kiran Joshi', BH_EMAIL: 'kiran@rdcconcrete.com' },
    { EMP_CODE: 'D002',   EMP_NAME: 'Sunita Devi',     RM_NAME: 'Anjali Mehta',  RM_EMAIL: 'anjali@rdcconcrete.com', BH_NAME: 'Kiran Joshi', BH_EMAIL: 'kiran@rdcconcrete.com' },
  ],
};

const CYCLES = ['Annual 2026', 'Mid-Year 2026', 'Probation Extension', 'Training Extension'];

// ── Store singleton ───────────────────────────────────────────────────────
// Use global to survive Next.js dev-mode hot-reloads (module re-evaluation
// clears module-level variables, but global persists across reloads).
function buildEmptyRow(emp, roleKey, cycle, pairId, rowType) {
  return {
    EMP_CODE:           emp.EMP_CODE,
    EMP_NAME:           emp.EMP_NAME,
    ROLE:               roleKey,
    CYCLE:              cycle,
    ROW_TYPE:           rowType,
    ASSESSMENT_PAIR_ID: pairId,
    RECOMMENDATION:     '',
    COMMENTS:           '',
    GROWTH_POTENTIAL:   '',
    KEY_REMARKS:        '',
    Q1_RATING: '', Q2_RATING: '', Q3_RATING: '', Q4_RATING: '', Q5_RATING: '',
    RM_NAME:  emp.RM_NAME,
    RM_EMAIL: emp.RM_EMAIL,
    BH_NAME:  emp.BH_NAME,
    BH_EMAIL: emp.BH_EMAIL,
    STATUS:           rowType === 'RM' ? 'Pending RM' : 'Pending BH',
    LOCK_STATUS:      'Unlocked',
    SELECTION_FLAG:   '',
    SELECTED_BY:      '',
    SELECTED_ON:      '',
    PARENT_RM_ROW:    '',
    RM_SUBMITTED_ON:  '',
    BH_SUBMITTED_ON:  '',
    LAST_UPDATED_BY:  '',
    LAST_UPDATED_ON:  '',
    // Internal only – not a sheet column:
    _rowNumber: null,
    _sheetGid:  0,
  };
}

export function getMockStore() {
  if (global.__pmsStore) return global.__pmsStore;

  global.__pmsStore = {
    // { roleKey: { rows: object[], headers: string[], sheetGid: 0, nextSeq: number } }
    roles: {},
    auditLog: [],
  };

  // Keep local alias for the init block below
  const _store = global.__pmsStore;

  // Pre-populate each role with sample employees for the first cycle
  for (const [roleKey, employees] of Object.entries(SAMPLE_EMPLOYEES)) {
    const rows = [];
    let seq = 1;
    for (const emp of employees) {
      const cycle = CYCLES[0]; // "Annual 2026"
      const pairId = `${emp.EMP_CODE}_${roleKey}_2026_Annual_${String(seq).padStart(4, '0')}`;
      seq++;
      const rmRow = buildEmptyRow(emp, roleKey, cycle, pairId, 'RM');
      rmRow._rowNumber = rows.length + 2; // 1-based, row 1 = header
      rows.push(rmRow);
    }
    _store.roles[roleKey] = {
      headers: MOCK_HEADERS,
      rows,
      sheetGid: 0,
      nextSeq: seq,
      name: `RDC PMS – ${roleKey}`,
    };
  }

  return global.__pmsStore;
}

// ── Mock operation helpers (called by workflow.js in mock mode) ──────────

export function mockGetRows(roleKey) {
  const store = getMockStore();
  return store.roles[roleKey]?.rows || [];
}

export function mockGetHeaders(roleKey) {
  const store = getMockStore();
  return store.roles[roleKey]?.headers || MOCK_HEADERS;
}

export function mockGetSheetName(roleKey) {
  const store = getMockStore();
  return store.roles[roleKey]?.name || roleKey;
}

export function mockFindRowByPairId(roleKey, pairId, rowType) {
  const rows = mockGetRows(roleKey);
  return rows.find((r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === rowType);
}

export function mockUpdateRow(roleKey, pairId, rowType, updates) {
  const rows = mockGetRows(roleKey);
  const idx = rows.findIndex(
    (r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === rowType
  );
  if (idx === -1) throw new Error(`Row not found: ${pairId} / ${rowType}`);
  Object.assign(rows[idx], updates, { LAST_UPDATED_ON: now() });
  return rows[idx];
}

export function mockInsertBhRow(roleKey, rmPairId) {
  const rows = mockGetRows(roleKey);
  const rmIdx = rows.findIndex(
    (r) => r.ASSESSMENT_PAIR_ID === rmPairId && r.ROW_TYPE === 'RM'
  );
  if (rmIdx === -1) throw new Error(`RM row not found for ${rmPairId}`);
  const rm = rows[rmIdx];

  const bhRow = buildEmptyRow(
    { EMP_CODE: rm.EMP_CODE, EMP_NAME: rm.EMP_NAME, RM_NAME: rm.RM_NAME, RM_EMAIL: rm.RM_EMAIL, BH_NAME: rm.BH_NAME, BH_EMAIL: rm.BH_EMAIL },
    rm.ROLE,
    rm.CYCLE,
    rmPairId,
    'BH'
  );
  bhRow.PARENT_RM_ROW = String(rm._rowNumber || rmIdx + 2);
  bhRow.STATUS = 'Pending BH';
  bhRow._rowNumber = rm._rowNumber ? rm._rowNumber + 1 : rmIdx + 3;

  // Insert BH row immediately after RM row
  rows.splice(rmIdx + 1, 0, bhRow);

  // Renumber all rows after insertion
  for (let i = rmIdx + 2; i < rows.length; i++) {
    if (rows[i]._rowNumber) rows[i]._rowNumber++;
  }

  return bhRow;
}

export function mockAddNewRmRow(roleKey, empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail) {
  const store = getMockStore();
  const roleStore = store.roles[roleKey];
  if (!roleStore) throw new Error(`Role ${roleKey} not found in mock store`);

  const seq = roleStore.nextSeq++;
  const year = new Date().getFullYear();
  const cycleSanitized = cycle.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const pairId = `${empCode}_${roleKey}_${year}_${cycleSanitized}_${String(seq).padStart(4, '0')}`;

  const emp = { EMP_CODE: empCode, EMP_NAME: empName, RM_NAME: rmName, RM_EMAIL: rmEmail, BH_NAME: bhName, BH_EMAIL: bhEmail };
  const rmRow = buildEmptyRow(emp, roleKey, cycle, pairId, 'RM');

  // Find insertion point: after the last row for this employee
  const rows = roleStore.rows;
  let lastEmpIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].EMP_CODE === empCode) {
      lastEmpIdx = i;
      break;
    }
  }

  if (lastEmpIdx === -1) {
    // New employee — append at end
    rmRow._rowNumber = rows.length + 2;
    rows.push(rmRow);
  } else {
    // Insert after last row for this employee
    rows.splice(lastEmpIdx + 1, 0, rmRow);
    rmRow._rowNumber = (rows[lastEmpIdx]._rowNumber || lastEmpIdx + 2) + 1;
    // Renumber subsequent rows
    for (let i = lastEmpIdx + 2; i < rows.length; i++) {
      if (rows[i]._rowNumber) rows[i]._rowNumber++;
    }
  }

  return { row: rmRow, pairId };
}
