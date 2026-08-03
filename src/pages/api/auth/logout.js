/**
 * POST /api/auth/logout
 * Clears the session cookie and ends the HR admin session.
 */
import { SESSION_COOKIE, REQUIRE_SSO } from '../../../lib/auth';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = [`${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`];

  // Under SSO this app holds no session of its own — the portal does. Clearing
  // the cookie would achieve nothing, and the client's redirect to /admin/login
  // would simply be recognised and sent back into the console. This short-lived
  // marker tells the middleware to end the portal session on that next request.
  if (REQUIRE_SSO && req.headers['x-auth-email']) {
    cookies.push('pms_sso_logout=1; Path=/; Max-Age=30; SameSite=Lax');
  }

  res.setHeader('Set-Cookie', cookies);
  return res.status(200).json({ ok: true });
}
