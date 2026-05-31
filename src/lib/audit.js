/**
 * audit.js
 * Writes audit log entries to the AUDIT_LOG tab of the role's Google Sheet.
 * In MOCK_MODE, writes to the in-memory mock store.
 */

import { format } from 'date-fns';
import { isMockMode } from './roleConfig';
import { AUDIT_TAB, ensureAuditTab, appendRow } from './sheetOps';
import { getMockStore } from './mockStore';

export const AUDIT_ACTIONS = {
  ROW_SELECTED:    'ROW_SELECTED',
  ROW_UNSELECTED:  'ROW_UNSELECTED',
  RM_SUBMITTED:    'RM_SUBMITTED',
  BH_ROW_CREATED:  'BH_ROW_CREATED',
  BH_SUBMITTED:    'BH_SUBMITTED',
  ROW_LOCKED:      'ROW_LOCKED',
  ROW_UNLOCKED:    'ROW_UNLOCKED',
  CYCLE_CREATED:   'CYCLE_CREATED',
};

/**
 * Writes a single audit log entry.
 *
 * @param {string} spreadsheetId
 * @param {{
 *   action: string,
 *   pairId?: string,
 *   empCode?: string,
 *   empName?: string,
 *   role?: string,
 *   cycle?: string,
 *   performedBy: string,
 *   details?: string,
 * }} entry
 */
export async function writeAuditEntry(spreadsheetId, entry) {
  const timestamp = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
  const row = [
    timestamp,
    entry.action || '',
    entry.pairId || '',
    entry.empCode || '',
    entry.empName || '',
    entry.role || '',
    entry.cycle || '',
    entry.performedBy || '',
    entry.details || '',
  ];

  if (isMockMode()) {
    const store = getMockStore();
    store.auditLog.push({
      TIMESTAMP: timestamp,
      ACTION: entry.action,
      ASSESSMENT_PAIR_ID: entry.pairId || '',
      EMP_CODE: entry.empCode || '',
      EMP_NAME: entry.empName || '',
      ROLE: entry.role || '',
      CYCLE: entry.cycle || '',
      PERFORMED_BY: entry.performedBy || '',
      DETAILS: entry.details || '',
    });
    return;
  }

  // Ensure the AUDIT_LOG tab exists
  await ensureAuditTab(spreadsheetId);
  await appendRow(spreadsheetId, row, AUDIT_TAB);
}

/**
 * Reads all audit log entries.
 * @param {string} spreadsheetId
 * @returns {Promise<object[]>}
 */
export async function readAuditLog(spreadsheetId) {
  if (isMockMode()) {
    return getMockStore().auditLog;
  }

  const { readAllRows } = await import('./sheetOps');
  const { headers, rows } = await readAllRows(spreadsheetId, AUDIT_TAB);
  const { buildColumnMap, rowToObject } = await import('./columnMap');
  const { indexMap } = buildColumnMap(headers);
  return rows.map((r) => rowToObject(r, indexMap));
}
