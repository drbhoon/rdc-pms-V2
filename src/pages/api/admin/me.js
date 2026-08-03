/**
 * GET /api/admin/me
 * Reports who the platform believes is calling, and with what role.
 *
 * Mainly a diagnostic: the console's sign-in is handled by the middleware
 * redirect, but when access looks wrong this is the quickest way to see
 * whether the identity header arrived and which role it mapped to.
 */
import { getSessionUser, REQUIRE_SSO } from '../../../lib/auth';

export default function handler(req, res) {
  const user = getSessionUser(req);
  return res.json({
    email: user?.email ?? null,
    role: user?.role ?? null,
    sso: REQUIRE_SSO,
  });
}
