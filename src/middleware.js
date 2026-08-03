import { NextResponse } from 'next/server';

/**
 * Keeps the HR console's sign-in consistent with the platform.
 *
 * On hr.rdcc.ai nginx has already verified the caller against the HR allowlist
 * and forwards X-Auth-Email, so the app's own login form is redundant — anyone
 * who reaches these pages is, by definition, already signed in. This sends them
 * straight to the console instead.
 *
 * Deliberately keyed on the header alone, not on REQUIRE_SSO. Next 14 runs
 * middleware on the Edge runtime, where process.env is inlined at build time
 * and a value supplied by Docker at runtime would read as undefined. The header
 * is a safe trigger on its own: nginx blanks it on every inbound request and
 * re-sets it only from the auth_request result, so its presence already means
 * the platform vouched for this person.
 */
const LOGOUT_MARKER = 'pms_sso_logout';

export function middleware(req) {
  const email = req.headers.get('x-auth-email');
  if (!email) return NextResponse.next();

  if (req.nextUrl.pathname !== '/admin/login') return NextResponse.next();

  // Just signed out of the console: end the shared portal session too,
  // otherwise this would bounce straight back into the console. The portal's
  // logout lives at the site root, outside this app's basePath.
  if (req.cookies.get(LOGOUT_MARKER)) {
    const res = NextResponse.redirect(new URL('/api/auth/logout', req.url));
    res.cookies.set(LOGOUT_MARKER, '', { path: '/', maxAge: 0 });
    return res;
  }

  const url = req.nextUrl.clone();
  url.pathname = '/admin';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*'] };
