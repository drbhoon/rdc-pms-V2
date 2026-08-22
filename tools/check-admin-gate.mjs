/**
 * Every admin API route must live at a path the platform gates.
 *
 *     node tools/check-admin-gate.mjs
 *
 * WHY THIS EXISTS -- and why it matters MORE here than elsewhere
 * -------------------------------------------------------------
 * PARAKH's session cookie is unsigned base64 JSON. Anyone can encode
 * {"role":"HR_SUPER_ADMIN"} and requireAuth / requireSuperAdmin will believe
 * it. Until that is fixed, the thing actually standing between these endpoints
 * and the internet is the nginx allowlist:
 *
 *     location ~ ^/parakh/(admin|api/admin|_next/data/[^/]+/admin)
 *
 * Only inside that match does nginx ask the portal whether the caller is on
 * the HR allowlist. So an admin route that sits OUTSIDE the pattern is not
 * merely broken -- it is reachable by anybody, holding a cookie they wrote
 * themselves.
 *
 * That is the opposite consequence to SRT and techno, where the same mistake
 * only breaks the feature. Same rule, higher stakes, so the same check.
 *
 * The employee and reviewer flows are deliberately ungated -- employees are
 * not on the HR allowlist and gating them would lock them out. Those routes
 * use neither guard, so they do not appear here.
 *
 * HOW IT DECIDES
 * --------------
 * Pages Router: the file path IS the URL. A route counts as admin-protected if
 * it calls requireAuth or requireSuperAdmin. Nothing to maintain by hand.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// The prefix nginx gates, from the location block quoted above. Its other half
// lives in rdc-hr-platform/nginx/default.conf; the two move together.
const GATED_PREFIXES = ["/api/admin"];

const GUARD_MARKERS = ["requireSuperAdmin", "requireAuth"];

const apiDir = join(process.cwd(), "src", "pages", "api");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** URL path for a Pages Router API file. index.js is the folder itself. */
function urlPath(file) {
  const rel = relative(apiDir, file).replace(/\.(js|jsx|ts|tsx)$/, "");
  const parts = rel.split(sep);
  if (parts[parts.length - 1] === "index") parts.pop();
  return "/api" + (parts.length ? "/" + parts.join("/") : "");
}

const protectedRoutes = [];
for (const file of walk(apiDir)) {
  const source = readFileSync(file, "utf8");
  const marker = GUARD_MARKERS.find((m) => source.includes(m));
  if (marker) protectedRoutes.push({ path: urlPath(file), file: relative(process.cwd(), file), marker });
}

const offenders = protectedRoutes.filter(
  (r) => !GATED_PREFIXES.some((p) => r.path === p || r.path.startsWith(p + "/")),
);

console.log(`admin-protected API routes found: ${protectedRoutes.length}`);
for (const r of protectedRoutes.sort((a, b) => a.path.localeCompare(b.path))) {
  console.log(`  [${offenders.includes(r) ? "FAIL" : "  ok"}] ${r.path}   (${r.marker})`);
}

if (protectedRoutes.length === 0) {
  console.log("\nNo admin-protected routes found at all -- the check itself is "
    + "probably broken. Failing rather than reporting a clean run.");
  process.exit(1);
}

if (offenders.length) {
  console.log("\nFAILED - these routes trust the session cookie but sit outside the "
    + "paths nginx gates. The cookie is unsigned, so on hr.rdcc.ai these are "
    + "reachable by anyone who forges one:");
  for (const r of offenders) console.log(`    ${r.path}   (${r.file})`);
  console.log("\nMove each one under /api/admin, or widen the location regex in "
    + "rdc-hr-platform/nginx/default.conf and GATED_PREFIXES here to match.");
  process.exit(1);
}

console.log("\nPASSED - every admin-protected API route is inside the gated paths.");
