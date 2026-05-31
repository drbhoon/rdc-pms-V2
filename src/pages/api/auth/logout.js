/**
 * POST /api/auth/logout
 * Clears the session cookie and ends the HR admin session.
 */
import { SESSION_COOKIE } from '../../../lib/auth';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );

  return res.status(200).json({ ok: true });
}
