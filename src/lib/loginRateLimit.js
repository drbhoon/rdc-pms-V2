/**
 * loginRateLimit.js
 *
 * In-memory sliding-window rate limiter for the login endpoint.
 * Keyed by client IP. Single-process (one Railway replica), so attacker
 * burst counts are not shared across replicas — but you only run one.
 *
 * Policy: at most 5 failed attempts per IP within a 15-minute sliding
 * window. After that, the IP is locked out for the remainder of the
 * window. Successful logins clear the IP's failure counter.
 *
 * Memory bound: only IPs that have failed at least once are stored.
 * Entries auto-expire on read; a hard cap of MAX_TRACKED_IPS (10000)
 * prevents unbounded growth from random scanners.
 */

const WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const MAX_FAILS = 5;                 // failures permitted per window
const MAX_TRACKED_IPS = 10_000;      // pathological-traffic safety net

const failures = new Map();          // ip -> [unix-ms timestamp, ...]

/** Extract the client IP, honouring Railway's x-forwarded-for header. */
export function getClientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) {
    // First entry in the list is the original client, rest are proxies
    return String(xff).split(',')[0].trim();
  }
  const real = req?.headers?.['x-real-ip'];
  if (real) return String(real).trim();
  return req?.socket?.remoteAddress || 'unknown';
}

/** Trim entries older than the window from the per-IP list. */
function activeFails(ip, now) {
  const list = failures.get(ip);
  if (!list) return [];
  const recent = list.filter((t) => now - t < WINDOW_MS);
  if (recent.length === 0) failures.delete(ip);
  else if (recent.length !== list.length) failures.set(ip, recent);
  return recent;
}

/**
 * Returns { allowed, retryAfterSec, failCount }. Call BEFORE doing
 * the password check. If `allowed` is false, return 429 immediately.
 */
export function checkRateLimit(ip) {
  const now = Date.now();
  const recent = activeFails(ip, now);
  if (recent.length < MAX_FAILS) {
    return { allowed: true, retryAfterSec: 0, failCount: recent.length };
  }
  // Window full — caller is locked out until the oldest failure expires
  const oldest = recent[0];
  const retryAfterMs = WINDOW_MS - (now - oldest);
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    failCount: recent.length,
  };
}

/** Record a failed login attempt. */
export function recordFailure(ip) {
  // Hard cap on map size — drop a random entry if too full
  if (failures.size >= MAX_TRACKED_IPS) {
    const firstKey = failures.keys().next().value;
    if (firstKey !== undefined) failures.delete(firstKey);
  }
  const now = Date.now();
  const list = activeFails(ip, now);
  list.push(now);
  failures.set(ip, list);
}

/** Clear an IP's failure history — call after a successful login. */
export function clearFailures(ip) {
  failures.delete(ip);
}

/** Test-only: reset everything. */
export function _resetForTests() {
  failures.clear();
}
