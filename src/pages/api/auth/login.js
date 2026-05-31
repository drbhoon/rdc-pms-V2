/**
 * POST /api/auth/login
 *
 * Validates HR admin credentials and sets a session cookie.
 *
 * Hardening (in this order):
 *   1. IP-based rate limit — 5 failed attempts / 15 min sliding window.
 *      Locked-out callers get HTTP 429 with Retry-After. Successful
 *      login clears the IP's failure counter.
 *   2. Constant-time credential check — verifyCredentials() always
 *      runs bcrypt.compare even when the email doesn't exist, so
 *      attackers can't enumerate valid emails by timing.
 *   3. Generic error message — same "Invalid credentials" for both
 *      "no such user" and "wrong password" paths.
 *   4. Audit log — every login attempt (success / failure / rate-limit)
 *      is written to AuditLog with the IP and email attempted.
 *   5. Cookie hardened — HttpOnly, SameSite=Lax, Path=/, Max-Age 7 days.
 *      Secure flag added when NODE_ENV === 'production' so the cookie
 *      is not sent over plain HTTP.
 */
import { verifyCredentials, encodeSession, SESSION_COOKIE } from '../../../lib/auth';
import { appendAudit } from '../../../lib/queries';
import {
  checkRateLimit,
  recordFailure,
  clearFailures,
  getClientIp,
} from '../../../lib/loginRateLimit';

// Best-effort audit write. Login must NEVER fail because the audit DB
// is unreachable — log to console and move on.
async function safeAudit(action, performedBy, details) {
  try {
    await appendAudit({ action, performedBy, details });
  } catch (e) {
    console.error('[login audit]', action, e.message);
  }
}

function buildSetCookie(value, maxAgeSec) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'SameSite=Lax',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rawEmail = (req.body && typeof req.body.email === 'string') ? req.body.email : '';
  const password = (req.body && typeof req.body.password === 'string') ? req.body.password : '';
  const email = rawEmail.trim().toLowerCase();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // ── 1. Rate limit (BEFORE the bcrypt check, so brute-forcers don't
  //       get 100ms of compute per attempt) ──────────────────────────
  const gate = checkRateLimit(ip);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec));
    await safeAudit('LOGIN_RATE_LIMITED', `login:${email || 'anon'}`, {
      ip, email, retryAfterSec: gate.retryAfterSec, failCount: gate.failCount,
    });
    return res.status(429).json({
      error: 'Too many failed attempts. Please try again later.',
    });
  }

  try {
    // ── 2 + 3. Constant-time credential check + generic error ───────
    const user = await verifyCredentials(email, password);
    if (!user) {
      recordFailure(ip);
      const after = checkRateLimit(ip);
      await safeAudit('LOGIN_FAILED', `login:${email}`, {
        ip, email, failCount: after.failCount,
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ── Success: clear failure counter, set cookie, audit ───────────
    clearFailures(ip);

    const cookieVal = encodeSession(user);
    res.setHeader('Set-Cookie', buildSetCookie(cookieVal, 86400 * 7));

    await safeAudit('LOGIN_SUCCESS', user.email, {
      ip, role: user.role,
    });

    return res.status(200).json({ ok: true, user: { name: user.name, role: user.role } });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
