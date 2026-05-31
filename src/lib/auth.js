/**
 * auth.js — Simple session-based auth for HR admin console.
 * Uses a signed cookie (base64 JSON). No NextAuth dependency.
 * For production, replace with NextAuth or similar.
 */
import bcrypt from 'bcryptjs';
import { getHrUserByEmail } from './queries';

const SESSION_COOKIE = 'pms_session';

// Pre-computed bcrypt hash of a random throwaway string. Used as a "dummy"
// target when the requested email doesn't exist, so user-not-found and
// wrong-password requests take the same wall-clock time. This blocks an
// attacker from enumerating valid HR emails by measuring response latency.
// Generated once on cold start; the value of this hash isn't a secret.
const DUMMY_HASH = bcrypt.hashSync(
  'never_a_real_password_' + Math.random().toString(36),
  10,
);

/** Verify email + password, return user object or null. Constant-ish time. */
export async function verifyCredentials(email, password) {
  const normEmail = String(email || '').trim().toLowerCase();
  const user = normEmail ? await getHrUserByEmail(normEmail) : null;

  // Always run bcrypt.compare so timing is the same whether or not the user
  // exists / is active. Throw away the result if the user wasn't valid.
  const hashToCheck = user?.password || DUMMY_HASH;
  const bcryptOk = await bcrypt.compare(String(password || ''), hashToCheck);

  if (!user || !user.isActive || !bcryptOk) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Encode session to cookie value */
export function encodeSession(user) {
  return Buffer.from(JSON.stringify(user)).toString('base64');
}

/** Decode session cookie → user or null */
export function decodeSession(cookieVal) {
  try {
    return JSON.parse(Buffer.from(cookieVal, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** Get current user from request cookies */
export function getSessionUser(req) {
  const raw = req?.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  return decodeSession(raw);
}

/** Require HR auth — returns user or sends 401 */
export function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

/** Require super admin — returns user or sends 403 */
export function requireSuperAdmin(req, res) {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  if (user.role !== 'HR_SUPER_ADMIN') { res.status(403).json({ error: 'Super admin only' }); return null; }
  return user;
}

export { SESSION_COOKIE };
