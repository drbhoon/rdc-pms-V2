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

// ── HR platform single sign-on ──────────────────────────────────────────────
// On hr.rdcc.ai, nginx has already verified the caller against the HR
// allowlist and forwards their address as X-Auth-Email. It blanks that header
// on every inbound request and re-sets it only from the auth_request result,
// so — unlike the cookie below — it cannot be forged by a caller.
//
// When SSO is on, the cookie is ignored ENTIRELY. That is deliberate: the
// session cookie is unsigned base64 JSON, so anyone could encode
// {"role":"HR_SUPER_ADMIN"} into it. Trusting only the header removes that.
const REQUIRE_SSO = process.env.REQUIRE_SSO === 'true';

const SSO_SUPER_ADMINS = String(process.env.SUPER_ADMINS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Build an HR user from the platform-verified identity. */
function ssoUser(email) {
  const normEmail = String(email).trim().toLowerCase();
  const localPart = normEmail.split('@')[0] || normEmail;
  return {
    // No HrUser row is created: nothing downstream uses user.id — audit
    // entries and ownership are all recorded by e-mail address.
    id: null,
    email: normEmail,
    name: localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ') || normEmail,
    role: SSO_SUPER_ADMINS.includes(normEmail) ? 'HR_SUPER_ADMIN' : 'HR_ADMIN',
    sso: true,
  };
}

/** Get current user from the platform identity, or the session cookie. */
export function getSessionUser(req) {
  if (REQUIRE_SSO) {
    const email = req?.headers?.['x-auth-email'];
    return email ? ssoUser(email) : null;
  }
  const raw = req?.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  return decodeSession(raw);
}

/**
 * Page guard for getServerSideProps.
 *
 * Every admin page used to inline its own copy of "read pms_session, decode
 * base64, redirect if absent". That second implementation ignored
 * getSessionUser entirely, so switching to SSO fixed the API routes while the
 * pages still demanded a cookie — and redirected to a login page that the
 * middleware immediately sent back, an infinite redirect for anyone who had
 * never signed in with a password.
 *
 * One implementation now, so an auth change cannot land in half the app.
 */
export function getPageAuth(req) {
  const user = getSessionUser(req);
  if (!user) return { redirect: { destination: '/admin/login', permanent: false } };
  return { props: { user } };
}

export { REQUIRE_SSO };

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
