/**
 * roleConfig.js
 * Reads role → Google Sheet ID mapping from environment variables.
 *
 * Environment variable conventions:
 *   ROLE_KEYS=PI,GET,DET
 *   SHEET_ID_PI=<google-sheet-id>
 *   ROLE_LABEL_PI=Plant Incharge
 *
 * In mock mode (MOCK_MODE=true), real sheet IDs are not required.
 */

/**
 * Returns an array of role config objects.
 * [{ key: 'PI', label: 'Plant Incharge', sheetId: '...' }, ...]
 */
export function getRoleConfigs() {
  const keys = (process.env.ROLE_KEYS || 'PI,GET,DET').split(',').map((k) => k.trim());

  return keys.map((key) => ({
    key,
    label: process.env[`ROLE_LABEL_${key}`] || key,
    sheetId: process.env[`SHEET_ID_${key}`] || null,
  }));
}

/**
 * Returns a single role config by key.
 * @param {string} roleKey
 */
export function getRoleConfig(roleKey) {
  const configs = getRoleConfigs();
  return configs.find((r) => r.key === roleKey) || null;
}

/**
 * Returns super-admin emails from env.
 * @returns {string[]}
 */
export function getSuperAdmins() {
  return (process.env.SUPER_ADMINS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Returns the current user identity (placeholder until auth is wired up).
 * In production, replace with actual session/auth user.
 * @param {import('next').NextApiRequest} req
 * @returns {string}
 */
export function getCurrentUser(req) {
  // Check for a simple x-pms-user header (set by frontend from localStorage/cookie)
  const headerUser = req?.headers?.['x-pms-user'];
  if (headerUser) return headerUser;
  return process.env.DEFAULT_USER || 'hr@rdcconcrete.com';
}

export const isMockMode = () => process.env.MOCK_MODE === 'true';
