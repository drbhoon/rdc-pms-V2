/**
 * GET /api/reviewer/[token]
 * Public endpoint — given a ReviewerLink token, return:
 *   - reviewer info (email, role, roleKey, cycle)
 *   - list of assessments still pending for this reviewer
 *   - role template (label + profile columns + rm/bh submit tokens handled by client)
 *
 * No auth required — token acts as the credential.
 */
import { getReviewerLinkByToken, getPairsForReviewer, getRole } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const link = await getReviewerLinkByToken(token);
    if (!link) return res.status(404).json({ error: 'Invalid or expired link.' });

    const [role, pairs] = await Promise.all([
      getRole(link.roleKey),
      getPairsForReviewer({
        email: link.email,
        role: link.role,
        roleKey: link.roleKey,
        cycle: link.cycle,
      }),
    ]);

    if (!role) return res.status(404).json({ error: 'Role template not found' });

    // Visible / done lists by reviewer role:
    //   SELF: pending = PENDING_SELF; done = anything past it
    //   RM:   pending = PENDING_RM;   done = RM_SUBMITTED / FINALIZED
    //   BH:   pending = RM_SUBMITTED; done = FINALIZED
    let visibleStatus, submittedStatus;
    if (link.role === 'SELF') {
      visibleStatus    = 'PENDING_SELF';
      submittedStatus  = ['PENDING_RM', 'RM_SUBMITTED', 'FINALIZED'];
    } else if (link.role === 'BH') {
      visibleStatus    = 'RM_SUBMITTED';
      submittedStatus  = ['FINALIZED'];
    } else {
      visibleStatus    = 'PENDING_RM';
      submittedStatus  = ['RM_SUBMITTED', 'FINALIZED'];
    }

    const tokenFor = (p) =>
      link.role === 'SELF' ? p.selfToken
      : link.role === 'BH' ? p.bhToken
      : p.rmToken;
    const submittedOnFor = (p) =>
      link.role === 'SELF' ? p.selfSubmittedOn
      : link.role === 'BH' ? p.bhSubmittedOn
      : p.rmSubmittedOn;

    const pending = pairs
      .filter((p) => p.status === visibleStatus)
      .map((p) => ({
        pairId:   p.pairId,
        empCode:  p.empCode,
        empName:  p.empName,
        roleKey:  p.roleKey,
        cycle:    p.cycle,
        token:    tokenFor(p),
        status:   p.status,
        profile:  p.employee?.profileData || {},
      }));

    const done = pairs
      .filter((p) => submittedStatus.includes(p.status))
      .map((p) => ({
        pairId:   p.pairId,
        empCode:  p.empCode,
        empName:  p.empName,
        status:   p.status,
        submittedOn: submittedOnFor(p),
      }));

    return res.status(200).json({
      reviewer: {
        email:   link.email,
        role:    link.role,
        roleKey: link.roleKey,
        cycle:   link.cycle,
      },
      role: {
        roleKey:   role.roleKey,
        roleLabel: role.roleLabel,
      },
      pending,
      done,
    });
  } catch (err) {
    console.error('[reviewer GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
