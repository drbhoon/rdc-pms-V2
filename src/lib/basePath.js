/**
 * PARAKH is mounted under a path prefix on the HR platform
 * (hr.rdcc.ai/parakh), and at the root locally and on Railway.
 *
 * Next.js rewrites <Link> and router.push() automatically, but NOT raw
 * fetch() calls. Rather than touching ~74 call sites (and inevitably missing
 * some), installFetchBasePath() patches window.fetch once so any request to
 * an app-absolute path such as "/api/..." is sent to "/parakh/api/...".
 *
 * When BASE_PATH is empty the patch is a no-op, so root-mounted deployments
 * behave exactly as before.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBase(path) {
  if (!BASE_PATH || typeof path !== "string" || !path.startsWith("/")) return path;
  return path.startsWith(`${BASE_PATH}/`) ? path : `${BASE_PATH}${path}`;
}

export function installFetchBasePath() {
  if (!BASE_PATH) return;
  if (typeof window === "undefined") return;
  if (window.__parakhFetchPatched) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    // Only rewrite same-origin, app-absolute string URLs. Request objects,
    // absolute URLs (http…) and relative paths are passed through untouched.
    if (typeof input === "string" && input.startsWith("/") && !input.startsWith("//")) {
      return originalFetch(withBase(input), init);
    }
    return originalFetch(input, init);
  };

  window.__parakhFetchPatched = true;
}
