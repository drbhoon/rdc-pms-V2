/**
 * GET /api/admin/master/filter-options
 *
 * The lists behind the launch page's Location, Designation, Company and Cost
 * centre filters, fetched from the portal so they are exactly the lists its
 * /master page shows. Proxied for the same reason as master/employees: the
 * master key must never reach the browser.
 */
import { requireAuth } from '../../../../lib/auth';
import { fetchMasterFilterOptions, masterConfigured } from '../../../../lib/master';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  if (!masterConfigured()) {
    return res.status(503).json({
      error: 'The employee master is not configured for this deployment. '
           + 'MASTER_API_URL and MASTER_API_KEY need setting, then a restart.',
    });
  }

  try {
    return res.status(200).json(await fetchMasterFilterOptions());
  } catch (err) {
    console.error('[master/filter-options]', err.message);
    return res.status(502).json({ error: err.message });
  }
}
