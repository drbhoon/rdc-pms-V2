/**
 * invites.js — Batch logic for RM / BH dashboard emails.
 *
 * Two operations:
 *   runInvites()   — for each eligible pair (not yet invited, startOn reached),
 *                    send ONE dashboard email per reviewer listing all their
 *                    pending assessments, then mark pairs as invited.
 *   runReminders() — for each outstanding pair (already invited, not yet
 *                    submitted), send ONE reminder email per reviewer with the
 *                    current list.
 *
 * Both group pairs by (reviewerEmail, role, roleKey, cycle) so each reviewer
 * gets at most one email per (role, roleKey, cycle) per run.
 */
import { prisma } from './db';
import {
  getOrCreateReviewerLink,
  getPendingSelfInvites,
  getPendingRmInvites,
  getPendingBhInvites,
  getPendingRemindersForSelf,
  getPendingRemindersForRm,
  getPendingRemindersForBh,
  getPendingHrInvitesByRole,
  getPendingHrRemindersByRole,
  markInvited,
  markHrInvited,
  getRole,
} from './queries';
import { sendReviewerBatch } from './mailer';

// V2 commenter roles, in pipeline order.
const HR_ROLES = ['HR_SPOC', 'HR_HEAD', 'COTO'];
const HR_RESULT_KEY = { HR_SPOC: 'hrSpoc', HR_HEAD: 'hrHead', COTO: 'coto' };

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
  );
}

// Race runInvites against a hard timeout. Use this in form-submit handlers
// (RM/Self submit) so the user sees confirmation only AFTER the next reviewer
// is emailed — but never waits more than `ms` if SMTP is slow. Whatever
// doesn't go out in time is picked up by the next cron tick.
export async function runInvitesWithTimeout(ms = 12000) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true, ms }), ms);
  });
  try {
    return await Promise.race([runInvites(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Group an array of pairs by key(pair) → { key → [pair, ...] }
function groupBy(arr, keyFn) {
  const out = new Map();
  for (const p of arr) {
    const k = keyFn(p);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(p);
  }
  return out;
}

async function buildRoleLabelCache(roleKeys) {
  const cache = {};
  for (const rk of roleKeys) {
    if (cache[rk] !== undefined) continue;
    try {
      const r = await getRole(rk);
      cache[rk] = r?.roleLabel || rk;
    } catch {
      cache[rk] = rk;
    }
  }
  return cache;
}

// V2: process one HR commenter role for either invites or reminders.
// HR stages are keyed off HrReview rows (each has its own email + the parent
// pair). We group by (email, roleKey, cycle) — like SELF/RM/BH — so one
// commenter gets one dashboard email listing all the pairs awaiting them.
async function processHrRole({ role, base, isReminder, result }) {
  const reviews = isReminder
    ? await getPendingHrRemindersByRole(role)
    : await getPendingHrInvitesByRole(role);
  if (reviews.length === 0) return;

  const labels = await buildRoleLabelCache([...new Set(reviews.map((r) => r.pair.roleKey))]);
  const groups = groupBy(reviews, (r) =>
    `${(r.email || '').toLowerCase()}|${r.pair.roleKey}|${r.pair.cycle}`
  );
  const gk = HR_RESULT_KEY[role];

  for (const [, groupReviews] of groups) {
    const first = groupReviews[0];
    if (!first.email) continue;
    try {
      const link = await getOrCreateReviewerLink(first.email, role, first.pair.roleKey, first.pair.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:         first.email,
        name:       first.name || first.email,
        role,
        roleLabel:  labels[first.pair.roleKey] || first.pair.roleKey,
        cycle:      first.pair.cycle,
        pairs:      groupReviews.map((r) => r.pair),  // pair carries empName/empCode/cycle/employee.profileData
        dashboardUrl,
        isReminder,
      });
      if (!isReminder) await markHrInvited(groupReviews.map((r) => r.id));
      result[`${gk}GroupsEmailed`] = (result[`${gk}GroupsEmailed`] || 0) + 1;
      result[`${gk}PairsMarked`]   = (result[`${gk}PairsMarked`]   || 0) + groupReviews.length;
    } catch (e) {
      result.errors.push(`${role}${isReminder ? '-R' : ''} ${first.email} ${first.pair.roleKey}/${first.pair.cycle}: ${e.message}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Invites — first-time emails, respects startOn
// ────────────────────────────────────────────────────────────────────────────

export async function runInvites() {
  const base = appUrl();
  const result = {
    selfGroupsEmailed: 0,
    selfPairsMarked:   0,
    rmGroupsEmailed:   0,
    rmPairsMarked:     0,
    bhGroupsEmailed:   0,
    bhPairsMarked:     0,
    hrSpocGroupsEmailed: 0, hrSpocPairsMarked: 0,
    hrHeadGroupsEmailed: 0, hrHeadPairsMarked: 0,
    cotoGroupsEmailed:   0, cotoPairsMarked:   0,
    errors:            [],
  };

  // ── SELF side ──
  // Each self-assessment is one employee × one cycle, so the "group" is
  // typically a single pair. We still group by (email, roleKey, cycle) for
  // consistency in case an employee somehow lands two pairs in the same cycle.
  const selfPairs = await getPendingSelfInvites();
  const selfLabels = await buildRoleLabelCache([...new Set(selfPairs.map((p) => p.roleKey))]);
  const selfGroups = groupBy(selfPairs, (p) =>
    `${(p.selfEmail || '').toLowerCase()}|${p.roleKey}|${p.cycle}`
  );

  for (const [, groupPairs] of selfGroups) {
    const first = groupPairs[0];
    if (!first.selfEmail) continue; // safety — shouldn't happen, getPendingSelfInvites filters this
    try {
      const link = await getOrCreateReviewerLink(first.selfEmail, 'SELF', first.roleKey, first.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:         first.selfEmail,
        name:       first.selfName || first.empName,
        role:       'SELF',
        roleLabel:  selfLabels[first.roleKey] || first.roleKey,
        cycle:      first.cycle,
        pairs:      groupPairs,
        dashboardUrl,
        isReminder: false,
      });
      await markInvited(groupPairs.map((p) => p.pairId), 'SELF');
      result.selfGroupsEmailed += 1;
      result.selfPairsMarked   += groupPairs.length;
    } catch (e) {
      result.errors.push(`SELF ${first.selfEmail} ${first.roleKey}/${first.cycle}: ${e.message}`);
    }
  }

  // ── RM side ──
  const rmPairs = await getPendingRmInvites();
  const rmLabels = await buildRoleLabelCache([...new Set(rmPairs.map((p) => p.roleKey))]);
  const rmGroups = groupBy(rmPairs, (p) =>
    `${p.rmEmail.toLowerCase()}|${p.roleKey}|${p.cycle}`
  );

  for (const [, groupPairs] of rmGroups) {
    const first = groupPairs[0];
    try {
      const link = await getOrCreateReviewerLink(first.rmEmail, 'RM', first.roleKey, first.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:            first.rmEmail,
        name:          first.rmName,
        role:          'RM',
        roleLabel:     rmLabels[first.roleKey] || first.roleKey,
        cycle:         first.cycle,
        pairs:         groupPairs,
        dashboardUrl,
        isReminder:    false,
      });
      await markInvited(groupPairs.map((p) => p.pairId), 'RM');
      result.rmGroupsEmailed += 1;
      result.rmPairsMarked   += groupPairs.length;
    } catch (e) {
      result.errors.push(`RM ${first.rmEmail} ${first.roleKey}/${first.cycle}: ${e.message}`);
    }
  }

  // ── BH side ──
  const bhPairs = await getPendingBhInvites();
  const bhLabels = await buildRoleLabelCache([...new Set(bhPairs.map((p) => p.roleKey))]);
  const bhGroups = groupBy(bhPairs, (p) =>
    `${p.bhEmail.toLowerCase()}|${p.roleKey}|${p.cycle}`
  );

  for (const [, groupPairs] of bhGroups) {
    const first = groupPairs[0];
    try {
      const link = await getOrCreateReviewerLink(first.bhEmail, 'BH', first.roleKey, first.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:            first.bhEmail,
        name:          first.bhName,
        role:          'BH',
        roleLabel:     bhLabels[first.roleKey] || first.roleKey,
        cycle:         first.cycle,
        pairs:         groupPairs,
        dashboardUrl,
        isReminder:    false,
      });
      await markInvited(groupPairs.map((p) => p.pairId), 'BH');
      result.bhGroupsEmailed += 1;
      result.bhPairsMarked   += groupPairs.length;
    } catch (e) {
      result.errors.push(`BH ${first.bhEmail} ${first.roleKey}/${first.cycle}: ${e.message}`);
    }
  }

  // ── HR commenter stages (HR_SPOC → HR_HEAD → COTO) ──
  for (const role of HR_ROLES) {
    await processHrRole({ role, base, isReminder: false, result });
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Reminders — daily, for already-invited outstanding pairs
// ────────────────────────────────────────────────────────────────────────────

export async function runReminders() {
  const base = appUrl();
  const result = {
    selfGroupsEmailed: 0,
    selfPairsIncluded: 0,
    rmGroupsEmailed:   0,
    rmPairsIncluded:   0,
    bhGroupsEmailed:   0,
    bhPairsIncluded:   0,
    hrSpocGroupsEmailed: 0, hrSpocPairsMarked: 0,
    hrHeadGroupsEmailed: 0, hrHeadPairsMarked: 0,
    cotoGroupsEmailed:   0, cotoPairsMarked:   0,
    errors:            [],
  };

  const selfPairs = await getPendingRemindersForSelf();
  const rmPairs = await getPendingRemindersForRm();
  const bhPairs = await getPendingRemindersForBh();

  const selfLabels = await buildRoleLabelCache([...new Set(selfPairs.map((p) => p.roleKey))]);
  const rmLabels = await buildRoleLabelCache([...new Set(rmPairs.map((p) => p.roleKey))]);
  const bhLabels = await buildRoleLabelCache([...new Set(bhPairs.map((p) => p.roleKey))]);

  const selfGroups = groupBy(selfPairs, (p) =>
    `${(p.selfEmail || '').toLowerCase()}|${p.roleKey}|${p.cycle}`
  );
  const rmGroups = groupBy(rmPairs, (p) =>
    `${p.rmEmail.toLowerCase()}|${p.roleKey}|${p.cycle}`
  );
  const bhGroups = groupBy(bhPairs, (p) =>
    `${p.bhEmail.toLowerCase()}|${p.roleKey}|${p.cycle}`
  );

  for (const [, groupPairs] of selfGroups) {
    const first = groupPairs[0];
    if (!first.selfEmail) continue;
    try {
      const link = await getOrCreateReviewerLink(first.selfEmail, 'SELF', first.roleKey, first.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:         first.selfEmail,
        name:       first.selfName || first.empName,
        role:       'SELF',
        roleLabel:  selfLabels[first.roleKey] || first.roleKey,
        cycle:      first.cycle,
        pairs:      groupPairs,
        dashboardUrl,
        isReminder: true,
      });
      result.selfGroupsEmailed += 1;
      result.selfPairsIncluded += groupPairs.length;
    } catch (e) {
      result.errors.push(`SELF-R ${first.selfEmail} ${first.roleKey}/${first.cycle}: ${e.message}`);
    }
  }

  for (const [, groupPairs] of rmGroups) {
    const first = groupPairs[0];
    try {
      const link = await getOrCreateReviewerLink(first.rmEmail, 'RM', first.roleKey, first.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:         first.rmEmail,
        name:       first.rmName,
        role:       'RM',
        roleLabel:  rmLabels[first.roleKey] || first.roleKey,
        cycle:      first.cycle,
        pairs:      groupPairs,
        dashboardUrl,
        isReminder: true,
      });
      result.rmGroupsEmailed += 1;
      result.rmPairsIncluded += groupPairs.length;
    } catch (e) {
      result.errors.push(`RM-R ${first.rmEmail} ${first.roleKey}/${first.cycle}: ${e.message}`);
    }
  }

  for (const [, groupPairs] of bhGroups) {
    const first = groupPairs[0];
    try {
      const link = await getOrCreateReviewerLink(first.bhEmail, 'BH', first.roleKey, first.cycle);
      const dashboardUrl = `${base}/reviewer/${link.token}`;
      await sendReviewerBatch({
        to:         first.bhEmail,
        name:       first.bhName,
        role:       'BH',
        roleLabel:  bhLabels[first.roleKey] || first.roleKey,
        cycle:      first.cycle,
        pairs:      groupPairs,
        dashboardUrl,
        isReminder: true,
      });
      result.bhGroupsEmailed += 1;
      result.bhPairsIncluded += groupPairs.length;
    } catch (e) {
      result.errors.push(`BH-R ${first.bhEmail} ${first.roleKey}/${first.cycle}: ${e.message}`);
    }
  }

  // ── HR commenter reminders (HR_SPOC → HR_HEAD → COTO) ──
  for (const role of HR_ROLES) {
    await processHrRole({ role, base, isReminder: true, result });
  }

  return result;
}

// Utility: is "now" (UTC) within the midnight-IST window?
// Midnight IST = 18:30 UTC (prev day). Accept a ±15-min window so a sloppy cron
// can still fire reminders without double-firing.
export function isMidnightIstWindow(now = new Date(), windowMin = 15) {
  // Current minute offset from 18:30 UTC, modulo 24h
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const target = 18 * 60 + 30; // 18:30 UTC = 00:00 IST
  const delta = Math.min(
    Math.abs(mins - target),
    Math.abs(mins - target - 24 * 60),
    Math.abs(mins - target + 24 * 60),
  );
  return delta <= windowMin;
}

// Expose prisma so cron handlers can do last-run checks if ever needed
export { prisma };
