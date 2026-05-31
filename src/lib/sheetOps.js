/**
 * sheetOps.js
 * Low-level Google Sheets operations used throughout the PMS.
 *
 * All row numbers here are 1-based (matching Google Sheets convention).
 * Row 1 = header. Data rows start at 2.
 *
 * Sheet tab names:
 *   DATA_TAB  = 'DATA'       (main assessment data)
 *   AUDIT_TAB = 'AUDIT_LOG'  (audit trail)
 */

import { getSheetsClient } from './sheetsClient';

export const DATA_TAB = 'DATA';
export const AUDIT_TAB = 'AUDIT_LOG';

// ── Row background colors ──────────────────────────────────────────────────
export const COLORS = {
  white:  { red: 1,     green: 1,     blue: 1     },  // idle
  purple: { red: 0.698, green: 0.478, blue: 0.898 },  // selected / pending RM
  blue:   { red: 0.643, green: 0.761, blue: 0.957 },  // RM submitted
  green:  { red: 0.576, green: 0.769, blue: 0.490 },  // finalized / BH submitted
};

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Reads all rows from a sheet tab including the header.
 * Returns { headers: string[], rows: string[][], sheetGid: number }
 *
 * @param {string} spreadsheetId
 * @param {string} [tabName=DATA_TAB]
 * @returns {Promise<{ headers: string[], rows: string[][], sheetGid: number }>}
 */
export async function readAllRows(spreadsheetId, tabName = DATA_TAB) {
  const sheets = getSheetsClient();

  // Get data values
  const valuesResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}`,
  });

  const allValues = valuesResp.data.values || [];
  const headers = allValues[0] || [];
  const rows = allValues.slice(1); // data rows only

  // Get sheet metadata to find the sheetGid (needed for batchUpdate)
  const metaResp = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });
  const sheet = metaResp.data.sheets?.find(
    (s) => s.properties.title === tabName
  );
  const sheetGid = sheet?.properties?.sheetId ?? 0;

  return { headers, rows, sheetGid };
}

/**
 * Reads a single row by 1-based row number.
 * @param {string} spreadsheetId
 * @param {number} rowNumber  1-based (row 1 = headers)
 * @param {string} [tabName=DATA_TAB]
 * @returns {Promise<string[]>}
 */
export async function readRow(spreadsheetId, rowNumber, tabName = DATA_TAB) {
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!${rowNumber}:${rowNumber}`,
  });
  return resp.data.values?.[0] || [];
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Writes values to a specific row (overwrites entire row).
 * @param {string} spreadsheetId
 * @param {number} rowNumber  1-based
 * @param {string[]} values
 * @param {string} [tabName=DATA_TAB]
 */
export async function writeRow(spreadsheetId, rowNumber, values, tabName = DATA_TAB) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

/**
 * Writes values to specific cells within a row.
 * @param {string} spreadsheetId
 * @param {number} rowNumber  1-based
 * @param {Record<number, string>} cellMap  { colIndex(0-based): value }
 * @param {string} [tabName=DATA_TAB]
 */
export async function updateCells(spreadsheetId, rowNumber, cellMap, tabName = DATA_TAB) {
  const sheets = getSheetsClient();
  const entries = Object.entries(cellMap).map(([colIdx, value]) => ({
    range: `${tabName}!${colIndexToLetter(parseInt(colIdx))}${rowNumber}`,
    values: [[value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: entries,
    },
  });
}

/**
 * Appends a new row at the end of the sheet.
 * @param {string} spreadsheetId
 * @param {string[]} values
 * @param {string} [tabName=DATA_TAB]
 * @returns {Promise<number>} the 1-based row number of the appended row
 */
export async function appendRow(spreadsheetId, values, tabName = DATA_TAB) {
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
  // Parse the updated range to get the row number
  const updatedRange = resp.data.updates?.updatedRange || '';
  const match = updatedRange.match(/!.*?(\d+)$/);
  return match ? parseInt(match[1]) : -1;
}

// ── Row Insertion ──────────────────────────────────────────────────────────

/**
 * Inserts a blank row immediately BELOW a given 1-based row number,
 * then writes data into it.
 *
 * @param {string} spreadsheetId
 * @param {number} afterRowNumber   1-based row to insert below
 * @param {string[]} values         data to write into the new row
 * @param {number} sheetGid         numeric sheet tab ID
 * @param {string} [tabName=DATA_TAB]
 * @returns {Promise<number>}  1-based row number of the newly inserted row
 */
export async function insertRowBelow(spreadsheetId, afterRowNumber, values, sheetGid, tabName = DATA_TAB) {
  const sheets = getSheetsClient();

  // Step 1: Insert a blank row below afterRowNumber
  // In the API, startIndex is 0-based. Inserting at afterRowNumber (0-based)
  // places the new row at 1-based position afterRowNumber + 1.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: sheetGid,
              dimension: 'ROWS',
              startIndex: afterRowNumber, // 0-based = afterRowNumber (since 1-based afterRowNumber → 0-based afterRowNumber - 1, +1 = afterRowNumber)
              endIndex: afterRowNumber + 1,
            },
            inheritFromBefore: true,
          },
        },
      ],
    },
  });

  const newRowNumber = afterRowNumber + 1; // 1-based

  // Step 2: Write data into the newly inserted row
  await writeRow(spreadsheetId, newRowNumber, values, tabName);

  return newRowNumber;
}

// ── Row Coloring ───────────────────────────────────────────────────────────

/**
 * Sets the background color of an entire row.
 * @param {string} spreadsheetId
 * @param {number} rowNumber    1-based
 * @param {{ red: number, green: number, blue: number }} color
 * @param {number} sheetGid
 * @param {number} [totalCols=30]
 */
export async function colorRow(spreadsheetId, rowNumber, color, sheetGid, totalCols = 30) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetGid,
              startRowIndex: rowNumber - 1, // 0-based
              endRowIndex: rowNumber,       // exclusive
              startColumnIndex: 0,
              endColumnIndex: totalCols,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: color,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ],
    },
  });
}

// ── Range Protection ───────────────────────────────────────────────────────

/**
 * Protects a row so only the service account can edit it.
 * @param {string} spreadsheetId
 * @param {number} rowNumber      1-based
 * @param {number} sheetGid
 * @param {string} description    e.g. "RM submitted – locked"
 * @param {number} [totalCols=30]
 */
export async function protectRow(spreadsheetId, rowNumber, sheetGid, description, totalCols = 30) {
  const sheets = getSheetsClient();
  const serviceEmail = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || '';

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId: sheetGid,
                startRowIndex: rowNumber - 1,
                endRowIndex: rowNumber,
                startColumnIndex: 0,
                endColumnIndex: totalCols,
              },
              description,
              warningOnly: false,
              editors: {
                // Only the service account can edit; everyone else is blocked
                users: serviceEmail ? [serviceEmail] : [],
                groups: [],
                domainUsersCanEdit: false,
              },
            },
          },
        },
      ],
    },
  });
}

/**
 * Removes protection from a row (super admin unlock).
 * Finds protection ranges that overlap the given row and removes them.
 * @param {string} spreadsheetId
 * @param {number} rowNumber  1-based
 * @param {number} sheetGid
 */
export async function unprotectRow(spreadsheetId, rowNumber, sheetGid) {
  const sheets = getSheetsClient();
  const metaResp = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = metaResp.data.sheets?.find((s) => s.properties.sheetId === sheetGid);
  const protectedRanges = sheet?.protectedRanges || [];

  const row0 = rowNumber - 1; // 0-based
  const toRemove = protectedRanges.filter((pr) => {
    const r = pr.range;
    return r.sheetId === sheetGid && r.startRowIndex <= row0 && r.endRowIndex > row0;
  });

  if (toRemove.length === 0) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: toRemove.map((pr) => ({
        deleteProtectedRange: { protectedRangeId: pr.protectedRangeId },
      })),
    },
  });
}

// ── Sheet Tab Management ───────────────────────────────────────────────────

/**
 * Ensures the AUDIT_LOG tab exists in the spreadsheet.
 * Creates it if missing with the correct headers.
 * @param {string} spreadsheetId
 */
export async function ensureAuditTab(spreadsheetId) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties.title === AUDIT_TAB);
  if (exists) return;

  // Create the tab
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: AUDIT_TAB } } }],
    },
  });

  // Write headers
  const headers = [
    'TIMESTAMP', 'ACTION', 'ASSESSMENT_PAIR_ID',
    'EMP_CODE', 'EMP_NAME', 'ROLE', 'CYCLE',
    'PERFORMED_BY', 'DETAILS',
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${AUDIT_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Converts a 0-based column index to a spreadsheet letter (A, B, ..., Z, AA, ...).
 * @param {number} index  0-based
 * @returns {string}
 */
export function colIndexToLetter(index) {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode((i % 26) + 65) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/**
 * Returns the total number of columns in a sheet.
 * @param {string} spreadsheetId
 * @param {string} [tabName=DATA_TAB]
 * @returns {Promise<number>}
 */
export async function getColumnCount(spreadsheetId, tabName = DATA_TAB) {
  const { headers } = await readAllRows(spreadsheetId, tabName);
  return headers.length || 30;
}
