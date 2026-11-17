/**
 * POST /api/employee-portal/tasks
 *
 * Asked by the HR portal, over the private network, when an employee opens
 * hr.rdcc.ai/employees: "what is waiting on this person in PARAKH?"
 *
 *   header  x-master-key: <MASTER_API_KEY>   (the key the apps already share)
 *   body    { "email": "someone@rdc.in" }
 *
 * Answers with the forms that are theirs to fill now, grouped the way the
 * invite e-mails are (one group per role, template and cycle). Each group
 * carries the same "my review list" link the e-mail carried, and each person
 * in it the link to their form. Nobody approves anything from the portal:
 * the form is still filled here, as always.
 *
 * The links are credentials, exactly as they are in the e-mails. The portal
 * only ever asks for the address its signed-in user proved through Google, so
 * it shows them to the person the e-mail went to and nobody else. This route
 * is not for browsers, which is why it takes a key and not a session.
 */
import { timingSafeEqual } from 'crypto';
import { getPendingForEmail, getOrCreateReviewerLink, getRole } from '../../../lib/queries';
import { appBaseUrl } from '../../../lib/invites';

// What each role is asked to do, and the form it fills.
const ROLES = {
  SELF:    { title: 'Self-assessment',             form: '/form/self' },
  RM:      { title: 'Review as Reporting Manager', form: '/form/rm' },
  BH:      { title: 'Review as Business Head',     form: '/form/bh' },
  HR_SPOC: { title: 'HR-SPOC comments',            form: '/form/hr_spoc' },
  HR_HEAD: { title: 'HR Head comments',            form: '/form/hr_head' },
  COTO:    { title: 'COTO approval',               form: '/form/coto' },
};
const ROLE_ORDER = Object.keys(ROLES);

// Constant time, and an unset key never means "everyone passes".
function keyMatches(presented) {
  const expected = process.env.MASTER_API_KEY;
  if (!expected || typeof presented !== 'string' || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!keyMatches(req.headers['x-master-key'])) return res.status(401).json({ error: 'Not authorised' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'email is required.' });

  try {
    const rows = await getPendingForEmail(email);
    const base = appBaseUrl().replace(/\/$/, '');

    const byGroup = new Map();
    for (const r of rows) {
      const key = `${r.role}|${r.roleKey}|${r.cycle}`;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(r);
    }

    const groups = [];
    for (const members of byGroup.values()) {
      const first = members[0];
      const meta = ROLES[first.role];
      if (!meta) continue;
      const template = await getRole(first.roleKey);
      // The same link the invite and every reminder carried for this group.
      const link = await getOrCreateReviewerLink(email, first.role, first.roleKey, first.cycle);
      const back = encodeURIComponent(`/reviewer/${link.token}?from=form`);
      groups.push({
        role: first.role,
        title: meta.title,
        detail: `${template?.roleLabel || first.roleKey} · ${first.cycle}`,
        url: `${base}/reviewer/${link.token}`,
        urlLabel: first.role === 'SELF' ? 'Open in PARAKH' : 'Open my review list',
        items: members.map((m) => ({
          title: first.role === 'SELF' ? 'Your self-assessment' : `${m.empName} (${m.empCode})`,
          detail: null,
          url: `${base}${meta.form}/${m.token}?back=${back}`,
          since: m.since ? new Date(m.since).toISOString() : null,
        })),
      });
    }
    groups.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

    return res.status(200).json({ app: 'parakh', groups: groups.map(({ role, ...g }) => g) });
  } catch (err) {
    console.error('[employee-portal/tasks]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
