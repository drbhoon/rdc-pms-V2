/**
 * pairId.js
 * Generates and parses Assessment Pair IDs.
 *
 * Format: {EMP_CODE}_{ROLE_KEY}_{YEAR}_{CYCLE}_{SEQ}
 * Example: EMP001_PI_2026_Annual_0007
 *
 * The sequence number is per-role-sheet and increments globally
 * based on the highest existing sequence found in the sheet.
 */

/**
 * Generates a new Assessment Pair ID.
 * @param {string} empCode   e.g. "EMP001"
 * @param {string} roleKey   e.g. "PI"
 * @param {string} cycle     e.g. "Annual 2026" → sanitized to "Annual_2026"
 * @param {number} seq       next available sequence number (passed by caller)
 * @returns {string}
 */
export function generatePairId(empCode, roleKey, cycle, seq) {
  const year = new Date().getFullYear();
  // Sanitize cycle: replace spaces/special chars with underscores
  const cycleSanitized = cycle.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const seqStr = String(seq).padStart(4, '0');
  return `${empCode}_${roleKey}_${year}_${cycleSanitized}_${seqStr}`;
}

/**
 * Extracts the sequence number from an existing pair ID.
 * Returns 0 if the ID doesn't match expected format.
 * @param {string} pairId
 * @returns {number}
 */
export function extractSeq(pairId) {
  if (!pairId) return 0;
  const parts = pairId.split('_');
  const last = parseInt(parts[parts.length - 1], 10);
  return isNaN(last) ? 0 : last;
}

/**
 * Given an array of existing pair IDs, returns the next sequence number.
 * @param {string[]} existingPairIds
 * @returns {number}
 */
export function nextSeq(existingPairIds) {
  if (!existingPairIds || existingPairIds.length === 0) return 1;
  const maxSeq = Math.max(...existingPairIds.map(extractSeq));
  return maxSeq + 1;
}
