/**
 * Which template profile columns the employee master can fill.
 *
 * Shared by the launch API and the launch screen ON PURPOSE. Two copies of
 * this answer would drift, and the symptom would be quiet: HR typing into a
 * box the server then overwrites, or a column the screen never offers and the
 * master never fills, leaving it permanently blank in the report.
 */

/** Case and punctuation are noise: "Date of Joining" ≡ "date_of_joining". */
export const foldKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Master field → the template column names it is allowed to fill, folded.
 *
 * Aliases exist because templates were written by different people over years
 * and name the same fact differently. "Plant Location" appears in 13 of the 20
 * templates and is exactly the master's `location` (BG-Budigere, PB-Derabassi)
 * — confirmed by Dr Bhoon 2026-08-09. Without the alias HR would retype the
 * single most common field on nearly every launch.
 *
 * Add here only where the meaning is genuinely the same. A wrong alias writes
 * wrong data into someone's appraisal, which is worse than an empty box.
 * Note the master also carries `city` (Bangalore) — that is NOT the plant.
 */
export const MASTER_PROFILE_ALIASES = {
  designation:     ['designation'],
  location:        ['location', 'plantlocation'],
  city:            ['city'],
  cost_centre:     ['costcentre', 'costcenter'],
  company:         ['company'],
  date_of_joining: ['dateofjoining', 'doj'],
};

export const MASTER_PROFILE_FIELDS = Object.keys(MASTER_PROFILE_ALIASES);

/**
 * Given a template's profileCols, work out which the master covers.
 *
 * @returns {{ byField: Map<string,string>, coveredFolded: Set<string> }}
 *   byField: master field → the template column name to write it under
 *            (falls back to the master's own name when the template has no
 *            matching column, so the value is still carried through)
 *   coveredFolded: folded template keys the master fills — everything else is
 *            typed by hand.
 */
export function masterCoverage(profileCols) {
  const declared = new Map(
    (Array.isArray(profileCols) ? profileCols : [])
      .map((c) => [foldKey(c?.key ?? c), c?.key ?? c]),
  );

  const byField = new Map();
  const coveredFolded = new Set();

  for (const field of MASTER_PROFILE_FIELDS) {
    let target = null;
    for (const alias of MASTER_PROFILE_ALIASES[field]) {
      if (declared.has(alias)) { target = declared.get(alias); break; }
    }
    byField.set(field, target || field);
    if (target) coveredFolded.add(foldKey(target));
  }

  return { byField, coveredFolded };
}

/** The template columns HR must type, because the master has no equivalent. */
export function editableProfileCols(profileCols) {
  const { coveredFolded } = masterCoverage(profileCols);
  return (Array.isArray(profileCols) ? profileCols : [])
    .filter((c) => !coveredFolded.has(foldKey(c?.key ?? c)));
}
