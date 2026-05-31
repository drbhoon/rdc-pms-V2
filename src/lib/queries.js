/**
 * queries.js — All database operations for the PMS.
 * Thin wrapper around Prisma — keeps API routes clean.
 */
import { prisma } from './db';
import { generatePairId } from './pairId';

// ── Role Templates ─────────────────────────────────────────────────────────

export async function getAllRoles({ includeInactive = false } = {}) {
  return prisma.roleTemplate.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { roleKey: 'asc' },
  });
}

// Always returns the template even if inactive — archived reports, form GETs,
// and audit log lookups still need to resolve a roleKey after soft-delete.
export async function getRole(roleKey) {
  return prisma.roleTemplate.findUnique({ where: { roleKey } });
}

export async function upsertRole(roleKey, roleLabel, questions, opts = {}) {
  const { filename, profileCols, rmNameCol, rmEmailCol, bhNameCol, bhEmailCol, includeSelf } = opts;
  const data = {
    roleLabel, questions,
    ...(filename    !== undefined && { filename }),
    ...(profileCols !== undefined && { profileCols }),
    ...(rmNameCol   !== undefined && { rmNameCol }),
    ...(rmEmailCol  !== undefined && { rmEmailCol }),
    ...(bhNameCol   !== undefined && { bhNameCol }),
    ...(bhEmailCol  !== undefined && { bhEmailCol }),
    ...(includeSelf !== undefined && { includeSelf: !!includeSelf }),
  };
  return prisma.roleTemplate.upsert({
    where:  { roleKey },
    update: data,
    create: { roleKey, ...data },
  });
}

// Soft delete — flips isActive=false so the template vanishes from dropdowns
// but history (employees, pairs, audit log, archived reports) stays intact.
// Super Admin can reactivate via DB or a future restore endpoint.
export async function deleteRole(roleKey) {
  return prisma.roleTemplate.update({
    where: { roleKey },
    data:  { isActive: false },
  });
}

export async function reactivateRole(roleKey) {
  return prisma.roleTemplate.update({
    where: { roleKey },
    data:  { isActive: true },
  });
}

// ── Employees ──────────────────────────────────────────────────────────────

export async function getEmployeesByRole(roleKey) {
  return prisma.employee.findMany({
    where:   { roleKey, isActive: true },
    orderBy: { empCode: 'asc' },
  });
}

export async function getArchivedEmployees(roleKey) {
  return prisma.employee.findMany({
    where:   { roleKey, isActive: false },
    orderBy: { empCode: 'asc' },
  });
}

export async function archiveEmployee(empCode, roleKey, performedBy) {
  await prisma.$transaction([
    prisma.employee.update({
      where: { empCode_roleKey: { empCode, roleKey } },
      data:  { isActive: false },
    }),
    prisma.assessmentPair.updateMany({
      where: { empCode, roleKey },
      data:  { isArchived: true, archivedOn: new Date(), archivedBy: performedBy },
    }),
  ]);
}

export async function restoreEmployee(empCode, roleKey) {
  await prisma.$transaction([
    prisma.employee.update({
      where: { empCode_roleKey: { empCode, roleKey } },
      data:  { isActive: true },
    }),
    prisma.assessmentPair.updateMany({
      where: { empCode, roleKey },
      data:  { isArchived: false, archivedOn: null, archivedBy: null },
    }),
  ]);
}

export async function deleteEmployee(empCode, roleKey) {
  // Delete in dependency order: audit logs → pairs → employee
  const pairs = await prisma.assessmentPair.findMany({
    where:  { empCode, roleKey },
    select: { pairId: true },
  });
  const pairIds = pairs.map((p) => p.pairId);
  if (pairIds.length) {
    await prisma.auditLog.deleteMany({ where: { pairId: { in: pairIds } } });
    await prisma.assessmentPair.deleteMany({ where: { pairId: { in: pairIds } } });
  }
  return prisma.employee.delete({ where: { empCode_roleKey: { empCode, roleKey } } });
}

export async function upsertEmployee(empCode, empName, roleKey, profileData = {}, email = null) {
  return prisma.employee.upsert({
    where:  { empCode_roleKey: { empCode, roleKey } },
    update: { empName, profileData, ...(email !== undefined ? { email } : {}) },
    create: { empCode, empName, roleKey, profileData, email },
  });
}

export async function bulkUpsertEmployees(rows) {
  // rows: [{ empCode, empName, roleKey, profileData, email? }]
  return prisma.$transaction(rows.map((r) =>
    prisma.employee.upsert({
      where:  { empCode_roleKey: { empCode: r.empCode, roleKey: r.roleKey } },
      update: {
        empName: r.empName,
        profileData: r.profileData,
        ...(r.email !== undefined ? { email: r.email } : {}),
      },
      create: r,
    })
  ));
}

// ── Assessment Pairs ───────────────────────────────────────────────────────

export async function getPairsByRoleAndCycle(roleKey, cycle) {
  return prisma.assessmentPair.findMany({
    where:   { roleKey, cycle },
    orderBy: { empCode: 'asc' },
    include: { employee: { select: { profileData: true } } },
  });
}

export async function getPairById(pairId) {
  return prisma.assessmentPair.findUnique({ where: { pairId } });
}

export async function getPairByRmToken(rmToken) {
  return prisma.assessmentPair.findUnique({
    where:   { rmToken },
    include: { role: true },
  });
}

export async function getPairByBhToken(bhToken) {
  return prisma.assessmentPair.findUnique({
    where:   { bhToken },
    include: { role: true },
  });
}

export async function getPairBySelfToken(selfToken) {
  return prisma.assessmentPair.findUnique({
    where:   { selfToken },
    include: { role: true },
  });
}

export async function createPair({
  empCode, empName, roleKey, cycle,
  rmName, rmEmail, bhName, bhEmail,
  selectedBy, startOn,
  requireSelf = false, selfEmail = null, selfName = null,
}) {
  // Build pairId: count existing pairs for this employee+role+cycle
  const existing = await prisma.assessmentPair.count({ where: { empCode, roleKey, cycle } });
  const seq = String(existing + 1).padStart(4, '0');
  const pairId = generatePairId(empCode, roleKey, cycle, seq);

  // If self is required, the pair starts at PENDING_SELF and the RM is invited
  // only after self submission. Otherwise it starts at PENDING_RM exactly as before.
  const initialStatus = requireSelf ? 'PENDING_SELF' : 'PENDING_RM';

  return prisma.assessmentPair.create({
    data: {
      pairId, empCode, empName, roleKey, cycle,
      rmName, rmEmail, bhName, bhEmail,
      status: initialStatus,
      requireSelf,
      selfEmail: requireSelf ? selfEmail : null,
      selfName:  requireSelf ? selfName  : null,
      selectedBy, selectedOn: new Date(),
      lastUpdatedBy: selectedBy, lastUpdatedOn: new Date(),
      startOn: startOn ? new Date(startOn) : null,
    },
  });
}

// ── Reviewer Link (one dashboard link per SELF/RM/BH per roleKey+cycle) ────
export async function getOrCreateReviewerLink(email, role, roleKey, cycle) {
  const normEmail = String(email || '').trim().toLowerCase();
  const normRole  = role === 'SELF' ? 'SELF' : role === 'BH' ? 'BH' : 'RM';
  const existing = await prisma.reviewerLink.findUnique({
    where: { email_role_roleKey_cycle: { email: normEmail, role: normRole, roleKey, cycle } },
  });
  if (existing) return existing;
  return prisma.reviewerLink.create({
    data: { email: normEmail, role: normRole, roleKey, cycle },
  });
}

export async function getReviewerLinkByToken(token) {
  return prisma.reviewerLink.findUnique({ where: { token } });
}

// All pairs (with employee profileData) for a given reviewer+cycle.
// `status` filters the status: omit for all, 'PENDING_RM' for pending RM, etc.
// `role` is one of 'SELF' | 'RM' | 'BH' — selects which email column to match.
export async function getPairsForReviewer({ email, role, roleKey, cycle, status }) {
  const normEmail = String(email || '').trim().toLowerCase();
  let emailFilter;
  if (role === 'SELF') {
    emailFilter = { selfEmail: { equals: normEmail, mode: 'insensitive' }, requireSelf: true };
  } else if (role === 'BH') {
    emailFilter = { bhEmail: { equals: normEmail, mode: 'insensitive' } };
  } else {
    emailFilter = { rmEmail: { equals: normEmail, mode: 'insensitive' } };
  }
  const where = {
    roleKey,
    cycle,
    isArchived: false,
    ...emailFilter,
    ...(status ? { status } : {}),
  };
  return prisma.assessmentPair.findMany({
    where,
    include: { employee: { select: { profileData: true } } },
    orderBy: { empName: 'asc' },
  });
}

// Mark invitation emails as sent for a list of pairs (role = 'SELF' | 'RM' | 'BH')
export async function markInvited(pairIds, role) {
  const now = new Date();
  let data;
  if (role === 'SELF')      data = { selfInvitedOn: now };
  else if (role === 'BH')   data = { bhInvitedOn:   now };
  else                      data = { rmInvitedOn:   now };
  return prisma.assessmentPair.updateMany({ where: { pairId: { in: pairIds } }, data });
}

// Pairs that need a self-assessment invite (startOn reached OR null, status=PENDING_SELF, not yet invited)
export async function getPendingSelfInvites() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_SELF',
      isArchived: false,
      requireSelf: true,
      selfInvitedOn: null,
      selfEmail: { not: null },
      OR: [{ startOn: null }, { startOn: { lte: new Date() } }],
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { selfEmail: 'asc' }],
  });
}

// Outstanding self-assessments for daily reminders
export async function getPendingRemindersForSelf() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_SELF',
      isArchived: false,
      requireSelf: true,
      selfInvitedOn: { not: null },
      selfEmail: { not: null },
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { selfEmail: 'asc' }],
  });
}

// Pairs that need an RM invite (startOn reached OR null, RM not yet invited, status=PENDING_RM)
export async function getPendingRmInvites() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_RM',
      isArchived: false,
      rmInvitedOn: null,
      OR: [{ startOn: null }, { startOn: { lte: new Date() } }],
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { rmEmail: 'asc' }],
  });
}

// Pairs that need a BH invite (RM submitted, BH not yet invited)
export async function getPendingBhInvites() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'RM_SUBMITTED',
      isArchived: false,
      bhInvitedOn: null,
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { bhEmail: 'asc' }],
  });
}

// For daily reminders: all outstanding pairs (already invited, not yet submitted)
export async function getPendingRemindersForRm() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_RM',
      isArchived: false,
      rmInvitedOn: { not: null },
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { rmEmail: 'asc' }],
  });
}

export async function getPendingRemindersForBh() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'RM_SUBMITTED',
      isArchived: false,
      bhInvitedOn: { not: null },
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { bhEmail: 'asc' }],
  });
}

// Self-assessment submit: status flips PENDING_SELF → PENDING_RM so the
// existing RM invite/cron path picks it up. Self does NOT lock the pair.
export async function submitSelfAnswers(pairId, answers, performedBy) {
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      selfAnswers:     answers,
      status:          'PENDING_RM',
      selfSubmittedOn: new Date(),
      lastUpdatedBy:   performedBy,
      lastUpdatedOn:   new Date(),
    },
  });
}

export async function submitRmAnswers(pairId, answers, performedBy) {
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      rmAnswers:    answers,
      status:       'RM_SUBMITTED',
      rmSubmittedOn: new Date(),
      lastUpdatedBy: performedBy,
      lastUpdatedOn: new Date(),
    },
  });
}

export async function submitBhAnswers(pairId, answers, performedBy) {
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      bhAnswers:    answers,
      status:       'FINALIZED',
      lockStatus:   'LOCKED',
      bhSubmittedOn: new Date(),
      lastUpdatedBy: performedBy,
      lastUpdatedOn: new Date(),
    },
  });
}

export async function deletePair(pairId) {
  // Delete audit logs first (FK constraint), then the pair
  await prisma.auditLog.deleteMany({ where: { pairId } });
  return prisma.assessmentPair.delete({ where: { pairId } });
}

export async function unlockPair(pairId, performedBy) {
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      lockStatus:   'UNLOCKED',
      lastUpdatedBy: performedBy,
      lastUpdatedOn: new Date(),
    },
  });
}

// ── Dashboard stats ────────────────────────────────────────────────────────

export async function getDashboardStats(roleKey, cycle) {
  const where = { roleKey, cycle };
  const [total, pendingSelf, pendingRm, rmSubmitted, pendingBh, finalized] = await Promise.all([
    prisma.assessmentPair.count({ where }),
    prisma.assessmentPair.count({ where: { ...where, status: 'PENDING_SELF' } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'PENDING_RM'   } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'RM_SUBMITTED' } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'PENDING_BH'   } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'FINALIZED'    } }),
  ]);
  return { total, pendingSelf, pendingRm, rmSubmitted, pendingBh, finalized };
}

export async function getRecentActivity(limit = 20) {
  return prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take:    limit,
  });
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export async function appendAudit({ action, pairId, empCode, empName, roleKey, cycle, performedBy, details }) {
  return prisma.auditLog.create({
    data: { action, pairId, empCode, empName, roleKey, cycle, performedBy, details },
  });
}

export async function getAuditLog({ roleKey, cycle, limit = 100 } = {}) {
  return prisma.auditLog.findMany({
    where:   { ...(roleKey ? { roleKey } : {}), ...(cycle ? { cycle } : {}) },
    orderBy: { timestamp: 'desc' },
    take:    limit,
  });
}

// ── HR Users ───────────────────────────────────────────────────────────────

export async function getHrUserByEmail(email) {
  return prisma.hrUser.findUnique({ where: { email } });
}

export async function getAllHrUsers() {
  return prisma.hrUser.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createHrUser(email, name, role, hashedPassword) {
  return prisma.hrUser.create({ data: { email, name, role, password: hashedPassword } });
}

// ── Cycles list ────────────────────────────────────────────────────────────

export async function getCyclesByRole(roleKey) {
  const rows = await prisma.assessmentPair.findMany({
    where:  { roleKey },
    select: { cycle: true },
    distinct: ['cycle'],
    orderBy:  { cycle: 'desc' },
  });
  return rows.map((r) => r.cycle);
}
