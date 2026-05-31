/**
 * workflow.js
 * Core PMS business logic: select, submit RM, create BH, submit BH, lock.
 *
 * All functions route to mock or real Google Sheets based on MOCK_MODE.
 */

import { format } from 'date-fns';
import { isMockMode, getRoleConfig } from './roleConfig';
import { buildColumnMap, rowToObject, objectToRow } from './columnMap';
import { COLORS, DATA_TAB, readAllRows, writeRow, insertRowBelow, colorRow, protectRow, unprotectRow, appendRow } from './sheetOps';
import { writeAuditEntry, AUDIT_ACTIONS } from './audit';
import { generatePairId, nextSeq } from './pairId';
import {
  mockGetRows, mockGetHeaders, mockGetSheetName,
  mockUpdateRow, mockInsertBhRow, mockAddNewRmRow,
  mockFindRowByPairId, getMockStore,
} from './mockStore';

const now = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");

// ─────────────────────────────────────────────────────────────────────────────
// READ HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all rows for a role and returns them as objects with column names.
 * @param {string} roleKey
 * @returns {Promise<{ headers: string[], rows: object[], sheetGid: number, sheetName: string }>}
 */
export async function getRoleRows(roleKey) {
  if (isMockMode()) {
    return {
      headers: mockGetHeaders(roleKey),
      rows: mockGetRows(roleKey),
      sheetGid: 0,
      sheetName: mockGetSheetName(roleKey),
    };
  }

  const config = getRoleConfig(roleKey);
  if (!config?.sheetId) throw new Error(`No sheet ID configured for role: ${roleKey}`);

  const { headers, rows: rawRows, sheetGid } = await readAllRows(config.sheetId, DATA_TAB);
  const { indexMap } = buildColumnMap(headers);
  const rows = rawRows.map((r, i) => ({
    ...rowToObject(r, indexMap),
    _rowNumber: i + 2, // 1-based; row 1 = header
    _sheetGid: sheetGid,
  }));

  return { headers, rows, sheetGid, sheetName: `Role: ${roleKey}` };
}

/**
 * Returns all unique cycles present in the sheet for a role.
 * @param {string} roleKey
 * @returns {Promise<string[]>}
 */
export async function getCycles(roleKey) {
  const { rows } = await getRoleRows(roleKey);
  const cycles = [...new Set(rows.map((r) => r.CYCLE).filter(Boolean))];
  return cycles;
}

/**
 * Returns employee rows for a specific cycle (RM rows only, for selection view).
 * @param {string} roleKey
 * @param {string} cycle
 * @returns {Promise<object[]>}
 */
export async function getEmployeesForCycle(roleKey, cycle) {
  const { rows } = await getRoleRows(roleKey);
  // Return RM rows for this cycle (or rows without a ROW_TYPE, which are legacy)
  return rows.filter(
    (r) => r.CYCLE === cycle && (r.ROW_TYPE === 'RM' || !r.ROW_TYPE)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2: SELECT / UNSELECT EMPLOYEE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggles selection of an employee-cycle row.
 * If not selected → marks as selected (PURPLE).
 * If already selected by same user → unselects (WHITE).
 *
 * @param {string} roleKey
 * @param {string} pairId
 * @param {string} performedBy
 * @returns {Promise<{ selected: boolean, row: object }>}
 */
export async function toggleSelection(roleKey, pairId, performedBy) {
  if (isMockMode()) {
    const row = mockFindRowByPairId(roleKey, pairId, 'RM');
    if (!row) throw new Error(`Row not found: ${pairId}`);

    // Can only select rows with status Pending RM
    if (!['', 'Pending RM'].includes(row.STATUS)) {
      throw new Error(`Cannot select: status is "${row.STATUS}"`);
    }

    const alreadySelected = row.SELECTION_FLAG === 'Selected';
    const updates = alreadySelected
      ? { SELECTION_FLAG: '', SELECTED_BY: '', SELECTED_ON: '', STATUS: 'Pending RM' }
      : { SELECTION_FLAG: 'Selected', SELECTED_BY: performedBy, SELECTED_ON: now(), STATUS: 'Pending RM' };

    mockUpdateRow(roleKey, pairId, 'RM', updates);

    await writeAuditEntry('mock', {
      action: alreadySelected ? AUDIT_ACTIONS.ROW_UNSELECTED : AUDIT_ACTIONS.ROW_SELECTED,
      pairId, empCode: row.EMP_CODE, empName: row.EMP_NAME,
      role: roleKey, cycle: row.CYCLE, performedBy,
    });

    return { selected: !alreadySelected, row: mockFindRowByPairId(roleKey, pairId, 'RM') };
  }

  // Real sheets path
  const config = getRoleConfig(roleKey);
  const { headers, rows, sheetGid } = await getRoleRows(roleKey);
  const { indexMap } = buildColumnMap(headers);

  const row = rows.find((r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === 'RM');
  if (!row) throw new Error(`Row not found: ${pairId}`);

  const alreadySelected = row.SELECTION_FLAG === 'Selected';
  const updates = alreadySelected
    ? { SELECTION_FLAG: '', SELECTED_BY: '', SELECTED_ON: '' }
    : { SELECTION_FLAG: 'Selected', SELECTED_BY: performedBy, SELECTED_ON: now() };

  const updatedRow = { ...row, ...updates };
  const rowValues = objectToRow(updatedRow, indexMap, headers.length);

  await writeRow(config.sheetId, row._rowNumber, rowValues, DATA_TAB);
  await colorRow(
    config.sheetId, row._rowNumber,
    alreadySelected ? COLORS.white : COLORS.purple,
    sheetGid, headers.length
  );

  await writeAuditEntry(config.sheetId, {
    action: alreadySelected ? AUDIT_ACTIONS.ROW_UNSELECTED : AUDIT_ACTIONS.ROW_SELECTED,
    pairId, empCode: row.EMP_CODE, empName: row.EMP_NAME,
    role: roleKey, cycle: row.CYCLE, performedBy,
  });

  return { selected: !alreadySelected, row: updatedRow };
}

/**
 * Creates a new RM row for an employee in a new cycle.
 * Inserts near existing rows for the same employee to preserve adjacency.
 *
 * @param {string} roleKey
 * @param {{ empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail }} params
 * @param {string} performedBy
 * @returns {Promise<{ pairId: string, row: object }>}
 */
export async function createNewCycleRow(roleKey, params, performedBy) {
  const { empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail } = params;

  if (isMockMode()) {
    const { row, pairId } = mockAddNewRmRow(
      roleKey, empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail
    );
    await writeAuditEntry('mock', {
      action: AUDIT_ACTIONS.CYCLE_CREATED,
      pairId, empCode, empName, role: roleKey, cycle, performedBy,
      details: `New RM row created for cycle: ${cycle}`,
    });
    return { pairId, row };
  }

  // Real sheets path
  const config = getRoleConfig(roleKey);
  const { headers, rows, sheetGid } = await getRoleRows(roleKey);
  const { indexMap } = buildColumnMap(headers);

  // Determine next sequence number
  const existingPairIds = rows.map((r) => r.ASSESSMENT_PAIR_ID).filter(Boolean);
  const seq = nextSeq(existingPairIds);
  const pairId = generatePairId(empCode, roleKey, cycle, seq);

  // Find last row for this employee
  const empRows = rows.filter((r) => r.EMP_CODE === empCode);
  const insertAfterRow = empRows.length > 0
    ? Math.max(...empRows.map((r) => r._rowNumber))
    : rows.length + 1; // append at end

  const newRow = {
    EMP_CODE: empCode, EMP_NAME: empName,
    ROLE: roleKey, CYCLE: cycle,
    ROW_TYPE: 'RM', ASSESSMENT_PAIR_ID: pairId,
    RM_NAME: rmName, RM_EMAIL: rmEmail,
    BH_NAME: bhName, BH_EMAIL: bhEmail,
    STATUS: 'Pending RM', LOCK_STATUS: 'Unlocked',
    SELECTION_FLAG: '', SELECTED_BY: '', SELECTED_ON: '',
    LAST_UPDATED_BY: performedBy, LAST_UPDATED_ON: now(),
  };
  const rowValues = objectToRow(newRow, indexMap, headers.length);

  // Insert below the last employee row (or append)
  if (insertAfterRow <= rows.length + 1) {
    await insertRowBelow(config.sheetId, insertAfterRow, rowValues, sheetGid, DATA_TAB);
  } else {
    await appendRow(config.sheetId, rowValues, DATA_TAB);
  }

  await writeAuditEntry(config.sheetId, {
    action: AUDIT_ACTIONS.CYCLE_CREATED,
    pairId, empCode, empName, role: roleKey, cycle, performedBy,
  });

  return { pairId, row: newRow };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3: RM SUBMIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits the RM assessment for a given pair.
 * 1. Writes RM values to RM row.
 * 2. Colors RM row BLUE.
 * 3. Creates BH row immediately below.
 * 4. Colors BH row PURPLE (pending BH).
 * 5. Locks RM row assessment cells.
 * 6. Writes audit entry.
 *
 * @param {string} roleKey
 * @param {string} pairId
 * @param {object} assessmentValues  { Q1_RATING, Q1_COMMENT, RECOMMENDATION, ... }
 * @param {string} performedBy
 * @returns {Promise<{ rmRow: object, bhRow: object }>}
 */
export async function submitRmAssessment(roleKey, pairId, assessmentValues, performedBy) {
  if (isMockMode()) {
    const rm = mockFindRowByPairId(roleKey, pairId, 'RM');
    if (!rm) throw new Error(`RM row not found: ${pairId}`);
    if (rm.STATUS === 'RM Submitted' || rm.STATUS === 'Finalized') {
      throw new Error(`RM assessment already submitted for: ${pairId}`);
    }
    if (rm.LOCK_STATUS === 'RM Locked' || rm.LOCK_STATUS === 'Fully Locked') {
      throw new Error(`Row is locked: ${pairId}`);
    }

    mockUpdateRow(roleKey, pairId, 'RM', {
      ...assessmentValues,
      STATUS: 'RM Submitted',
      LOCK_STATUS: 'RM Locked',
      RM_SUBMITTED_ON: now(),
      LAST_UPDATED_BY: performedBy,
    });

    const bhRow = mockInsertBhRow(roleKey, pairId);

    await writeAuditEntry('mock', {
      action: AUDIT_ACTIONS.RM_SUBMITTED,
      pairId, empCode: rm.EMP_CODE, empName: rm.EMP_NAME,
      role: roleKey, cycle: rm.CYCLE, performedBy,
    });
    await writeAuditEntry('mock', {
      action: AUDIT_ACTIONS.BH_ROW_CREATED,
      pairId, empCode: rm.EMP_CODE, empName: rm.EMP_NAME,
      role: roleKey, cycle: rm.CYCLE, performedBy: 'SYSTEM',
      details: 'BH row auto-created after RM submission',
    });

    return {
      rmRow: mockFindRowByPairId(roleKey, pairId, 'RM'),
      bhRow,
    };
  }

  // Real sheets path
  const config = getRoleConfig(roleKey);
  const { headers, rows, sheetGid } = await getRoleRows(roleKey);
  const { indexMap } = buildColumnMap(headers);

  const rmRow = rows.find((r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === 'RM');
  if (!rmRow) throw new Error(`RM row not found: ${pairId}`);
  if (rmRow.STATUS === 'RM Submitted' || rmRow.STATUS === 'Finalized') {
    throw new Error(`RM assessment already submitted for: ${pairId}`);
  }
  if (rmRow.LOCK_STATUS !== 'Unlocked' && rmRow.LOCK_STATUS !== '') {
    throw new Error(`Row is locked: ${pairId}`);
  }

  // Update RM row
  const updatedRm = {
    ...rmRow,
    ...assessmentValues,
    STATUS: 'RM Submitted',
    LOCK_STATUS: 'RM Locked',
    RM_SUBMITTED_ON: now(),
    LAST_UPDATED_BY: performedBy,
    LAST_UPDATED_ON: now(),
  };
  const rmValues = objectToRow(updatedRm, indexMap, headers.length);
  await writeRow(config.sheetId, rmRow._rowNumber, rmValues, DATA_TAB);
  await colorRow(config.sheetId, rmRow._rowNumber, COLORS.blue, sheetGid, headers.length);
  await protectRow(config.sheetId, rmRow._rowNumber, sheetGid, `RM submitted – locked (${pairId})`, headers.length);

  // Create BH row immediately below RM row
  const bhData = {
    EMP_CODE: rmRow.EMP_CODE, EMP_NAME: rmRow.EMP_NAME,
    ROLE: rmRow.ROLE, CYCLE: rmRow.CYCLE,
    ROW_TYPE: 'BH', ASSESSMENT_PAIR_ID: pairId,
    RM_NAME: rmRow.RM_NAME, RM_EMAIL: rmRow.RM_EMAIL,
    BH_NAME: rmRow.BH_NAME, BH_EMAIL: rmRow.BH_EMAIL,
    PARENT_RM_ROW: String(rmRow._rowNumber),
    STATUS: 'Pending BH', LOCK_STATUS: 'Unlocked',
    LAST_UPDATED_BY: 'SYSTEM', LAST_UPDATED_ON: now(),
  };
  const bhValues = objectToRow(bhData, indexMap, headers.length);
  const bhRowNum = await insertRowBelow(config.sheetId, rmRow._rowNumber, bhValues, sheetGid, DATA_TAB);
  await colorRow(config.sheetId, bhRowNum, COLORS.purple, sheetGid, headers.length);

  await writeAuditEntry(config.sheetId, {
    action: AUDIT_ACTIONS.RM_SUBMITTED,
    pairId, empCode: rmRow.EMP_CODE, empName: rmRow.EMP_NAME,
    role: roleKey, cycle: rmRow.CYCLE, performedBy,
  });
  await writeAuditEntry(config.sheetId, {
    action: AUDIT_ACTIONS.BH_ROW_CREATED,
    pairId, empCode: rmRow.EMP_CODE, empName: rmRow.EMP_NAME,
    role: roleKey, cycle: rmRow.CYCLE, performedBy: 'SYSTEM',
    details: `BH row created at row ${bhRowNum}`,
  });

  return { rmRow: updatedRm, bhRow: { ...bhData, _rowNumber: bhRowNum } };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4: BH SUBMIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits the BH assessment for a given pair.
 * 1. Writes BH values to BH row.
 * 2. Colors BH row GREEN.
 * 3. Locks BH row.
 * 4. Writes audit entry.
 *
 * @param {string} roleKey
 * @param {string} pairId
 * @param {object} assessmentValues
 * @param {string} performedBy
 * @returns {Promise<{ bhRow: object }>}
 */
export async function submitBhAssessment(roleKey, pairId, assessmentValues, performedBy) {
  if (isMockMode()) {
    const bh = mockFindRowByPairId(roleKey, pairId, 'BH');
    if (!bh) throw new Error(`BH row not found: ${pairId}. RM must submit first.`);
    if (bh.STATUS === 'Finalized') {
      throw new Error(`BH assessment already finalized for: ${pairId}`);
    }
    if (bh.LOCK_STATUS === 'Fully Locked') {
      throw new Error(`BH row is locked: ${pairId}`);
    }

    mockUpdateRow(roleKey, pairId, 'BH', {
      ...assessmentValues,
      STATUS: 'Finalized',
      LOCK_STATUS: 'Fully Locked',
      BH_SUBMITTED_ON: now(),
      LAST_UPDATED_BY: performedBy,
    });

    // Also update RM row status to Finalized
    const rm = mockFindRowByPairId(roleKey, pairId, 'RM');
    if (rm) {
      mockUpdateRow(roleKey, pairId, 'RM', { STATUS: 'Finalized' });
    }

    await writeAuditEntry('mock', {
      action: AUDIT_ACTIONS.BH_SUBMITTED,
      pairId, empCode: bh.EMP_CODE, empName: bh.EMP_NAME,
      role: roleKey, cycle: bh.CYCLE, performedBy,
    });
    await writeAuditEntry('mock', {
      action: AUDIT_ACTIONS.ROW_LOCKED,
      pairId, empCode: bh.EMP_CODE, empName: bh.EMP_NAME,
      role: roleKey, cycle: bh.CYCLE, performedBy: 'SYSTEM',
      details: 'Both RM and BH rows fully locked after BH submission',
    });

    return { bhRow: mockFindRowByPairId(roleKey, pairId, 'BH') };
  }

  // Real sheets path
  const config = getRoleConfig(roleKey);
  const { headers, rows, sheetGid } = await getRoleRows(roleKey);
  const { indexMap } = buildColumnMap(headers);

  const bhRow = rows.find((r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === 'BH');
  if (!bhRow) throw new Error(`BH row not found: ${pairId}`);
  if (bhRow.STATUS === 'Finalized') throw new Error(`Already finalized: ${pairId}`);
  if (bhRow.LOCK_STATUS === 'Fully Locked') throw new Error(`BH row locked: ${pairId}`);

  const updatedBh = {
    ...bhRow,
    ...assessmentValues,
    STATUS: 'Finalized',
    LOCK_STATUS: 'Fully Locked',
    BH_SUBMITTED_ON: now(),
    LAST_UPDATED_BY: performedBy,
    LAST_UPDATED_ON: now(),
  };
  const bhValues = objectToRow(updatedBh, indexMap, headers.length);
  await writeRow(config.sheetId, bhRow._rowNumber, bhValues, DATA_TAB);
  await colorRow(config.sheetId, bhRow._rowNumber, COLORS.green, sheetGid, headers.length);
  await protectRow(config.sheetId, bhRow._rowNumber, sheetGid, `BH finalized – locked (${pairId})`, headers.length);

  // Update RM row status to Finalized
  const rmRow = rows.find((r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === 'RM');
  if (rmRow) {
    const updatedRm = { ...rmRow, STATUS: 'Finalized', LAST_UPDATED_ON: now() };
    await writeRow(config.sheetId, rmRow._rowNumber, objectToRow(updatedRm, indexMap, headers.length), DATA_TAB);
  }

  await writeAuditEntry(config.sheetId, {
    action: AUDIT_ACTIONS.BH_SUBMITTED,
    pairId, empCode: bhRow.EMP_CODE, empName: bhRow.EMP_NAME,
    role: roleKey, cycle: bhRow.CYCLE, performedBy,
  });
  await writeAuditEntry(config.sheetId, {
    action: AUDIT_ACTIONS.ROW_LOCKED,
    pairId, empCode: bhRow.EMP_CODE, empName: bhRow.EMP_NAME,
    role: roleKey, cycle: bhRow.CYCLE, performedBy: 'SYSTEM',
    details: 'Fully locked after BH submission',
  });

  return { bhRow: updatedBh };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6: SUPER ADMIN UNLOCK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Super admin only: unlocks a finalized row for correction.
 * @param {string} roleKey
 * @param {string} pairId
 * @param {string} rowType  'RM' | 'BH'
 * @param {string} performedBy
 * @param {string} reason
 */
export async function adminUnlockRow(roleKey, pairId, rowType, performedBy, reason) {
  if (isMockMode()) {
    const row = mockFindRowByPairId(roleKey, pairId, rowType);
    if (!row) throw new Error(`Row not found: ${pairId} / ${rowType}`);
    mockUpdateRow(roleKey, pairId, rowType, {
      LOCK_STATUS: 'Unlocked',
      STATUS: rowType === 'RM' ? 'RM Submitted' : 'Pending BH',
      LAST_UPDATED_BY: performedBy,
    });
    await writeAuditEntry('mock', {
      action: AUDIT_ACTIONS.ROW_UNLOCKED,
      pairId, empCode: row.EMP_CODE, empName: row.EMP_NAME,
      role: roleKey, cycle: row.CYCLE, performedBy,
      details: `Super admin unlock. Reason: ${reason}`,
    });
    return { success: true };
  }

  const config = getRoleConfig(roleKey);
  const { headers, rows, sheetGid } = await getRoleRows(roleKey);
  const { indexMap } = buildColumnMap(headers);

  const row = rows.find((r) => r.ASSESSMENT_PAIR_ID === pairId && r.ROW_TYPE === rowType);
  if (!row) throw new Error(`Row not found: ${pairId} / ${rowType}`);

  await unprotectRow(config.sheetId, row._rowNumber, sheetGid);

  const updatedRow = {
    ...row,
    LOCK_STATUS: 'Unlocked',
    STATUS: rowType === 'RM' ? 'RM Submitted' : 'Pending BH',
    LAST_UPDATED_BY: performedBy,
    LAST_UPDATED_ON: now(),
  };
  await writeRow(config.sheetId, row._rowNumber, objectToRow(updatedRow, indexMap, headers.length), DATA_TAB);
  await colorRow(config.sheetId, row._rowNumber, COLORS.blue, sheetGid, headers.length);

  await writeAuditEntry(config.sheetId, {
    action: AUDIT_ACTIONS.ROW_UNLOCKED,
    pairId, empCode: row.EMP_CODE, empName: row.EMP_NAME,
    role: roleKey, cycle: row.CYCLE, performedBy,
    details: `Super admin unlock. Reason: ${reason}`,
  });

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5: DASHBOARD DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns dashboard data: pending RM, pending BH, overdue, finalized.
 * @param {string} roleKey
 * @returns {Promise<{ pendingRm: object[], pendingBh: object[], finalized: object[] }>}
 */
export async function getDashboardData(roleKey) {
  const { rows } = await getRoleRows(roleKey);
  return {
    pendingRm:  rows.filter((r) => r.ROW_TYPE === 'RM' && ['Pending RM', ''].includes(r.STATUS) && r.SELECTION_FLAG !== 'Selected'),
    selected:   rows.filter((r) => r.ROW_TYPE === 'RM' && r.SELECTION_FLAG === 'Selected' && r.STATUS === 'Pending RM'),
    pendingBh:  rows.filter((r) => r.ROW_TYPE === 'BH' && r.STATUS === 'Pending BH'),
    rmSubmitted:rows.filter((r) => r.ROW_TYPE === 'RM' && r.STATUS === 'RM Submitted'),
    finalized:  rows.filter((r) => r.ROW_TYPE === 'BH' && r.STATUS === 'Finalized'),
  };
}
