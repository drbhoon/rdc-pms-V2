/**
 * Employee master client.
 *
 * The master lives in the portal and is refreshed nightly from ZingHR. PARAKH
 * reads it instead of asking HR to upload a spreadsheet.
 *
 * On hr.rdcc.ai this is http://portal:3000 over the private Docker network; on
 * Railway it is the portal's public HTTPS URL. Same code either way — only
 * MASTER_API_URL differs.
 *
 * SERVER ONLY. MASTER_API_KEY must never reach the browser, which is why the
 * console talks to /api/admin/master/* rather than to the portal directly.
 */

const BASE = () => String(process.env.MASTER_API_URL || '').replace(/\/$/, '');

export function masterConfigured() {
  return Boolean(BASE() && process.env.MASTER_API_KEY);
}

/**
 * Fetch employees from the master.
 *
 * @param {object} opts
 * @param {string[]} [opts.codes]   restrict to these employee codes
 * @param {boolean}  [opts.picker]  trim each row to what a name lookup needs
 * @param {object}   [opts.filters] location/designation/company/cost_centre/source
 *                                  arrays, q, and the dob_/doj_ date bounds
 */
export async function fetchMasterEmployees(opts = {}) {
  const params = new URLSearchParams();
  if (opts.picker) params.set('fields', 'picker');
  for (const code of opts.codes || []) params.append('code', code);
  for (const [key, value] of Object.entries(opts.filters || {})) {
    if (Array.isArray(value)) {
      for (const v of value) if (v) params.append(key, v);
    } else if (value) {
      params.set(key, value);
    }
  }

  const data = await masterGet('/api/master/employees', params);
  return Array.isArray(data?.employees) ? data.employees : [];
}

/**
 * The choices behind the master's filters — Location, Designation, Company and
 * Cost centre — exactly as the portal's own /master page offers them.
 */
export async function fetchMasterFilterOptions() {
  const data = await masterGet('/api/master/filter-options');
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    locations: list(data?.locations),
    designations: list(data?.designations),
    companies: list(data?.companies),
    costCentres: list(data?.costCentres),
  };
}

/** GET a master endpoint with our key; the error says which failure it was. */
async function masterGet(path, params) {
  if (!masterConfigured()) {
    throw new Error(
      'Employee master is not configured. Set MASTER_API_URL and MASTER_API_KEY.',
    );
  }

  const query = params && params.toString();
  const url = `${BASE()}${path}${query ? `?${query}` : ''}`;

  let response;
  try {
    // Capped: the console waits on this, and a portal that has stopped
    // answering should surface as a clear message rather than a hung page.
    response = await fetch(url, {
      headers: { 'x-master-key': process.env.MASTER_API_KEY },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(
      err?.name === 'TimeoutError'
        ? 'The employee master did not respond in time.'
        : `Could not reach the employee master: ${err?.message || 'network error'}`,
    );
  }

  if (response.status === 401) {
    throw new Error('The employee master rejected our key (MASTER_API_KEY).');
  }
  if (response.status === 404) {
    throw new Error(`The employee master does not offer ${path} — the portal needs updating.`);
  }
  if (!response.ok) {
    throw new Error(`Employee master returned HTTP ${response.status}.`);
  }

  return response.json();
}

/** Index a list of master records by employee_code for quick lookup. */
export function byCode(employees) {
  const map = new Map();
  for (const e of employees) map.set(e.employee_code, e);
  return map;
}
