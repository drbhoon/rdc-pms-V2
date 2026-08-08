/**
 * GET /api/admin/master/employees
 *
 * The console's window onto the shared employee master. Proxied rather than
 * called from the browser for two reasons: MASTER_API_KEY must never reach the
 * client, and the portal is on a different origin (a private Docker hostname in
 * production), so a direct call could not work anyway.
 *
 * ?picker=1 trims each row to code, name, designation, location and email —
 * enough to drive the RM/BH lookup, at a fraction of the bytes.
 */
import { requireAuth } from '../../../../lib/auth';
import { fetchMasterEmployees, masterConfigured } from '../../../../lib/master';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  if (!masterConfigured()) {
    // Stated plainly: this is a deployment gap, not a data problem, and the
    // person reading it in the console cannot fix it from the console.
    return res.status(503).json({
      error: 'The employee master is not configured for this deployment. '
           + 'MASTER_API_URL and MASTER_API_KEY need setting, then a restart.',
    });
  }

  const { picker, q, location, designation, company, cost_centre,
          doj_from, doj_to, dob_from, dob_to } = req.query;

  // Next gives a string for one value and an array for several; the master
  // wants repeated params either way.
  const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

  try {
    const employees = await fetchMasterEmployees({
      picker: picker === '1' || picker === 'true',
      filters: {
        q: q || '',
        location: list(location),
        designation: list(designation),
        company: list(company),
        cost_centre: list(cost_centre),
        doj_from: doj_from || '',
        doj_to: doj_to || '',
        dob_from: dob_from || '',
        dob_to: dob_to || '',
      },
    });
    return res.status(200).json({ count: employees.length, employees });
  } catch (err) {
    console.error('[master/employees]', err.message);
    // The message from master.js already says which failure this is —
    // unreachable, rejected key, or timed out — so pass it through.
    return res.status(502).json({ error: err.message });
  }
}
