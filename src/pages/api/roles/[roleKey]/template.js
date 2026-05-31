/**
 * GET /api/roles/[roleKey]/template
 * Returns the sheet headers for a role, classified by column type.
 * Used by the Admin Role Setup / Template Preview screen.
 */
import { getRoleRows } from '../../../../lib/workflow';
import { buildColumnMap, classifyColumn, colLabel, COLUMN_TYPES } from '../../../../lib/columnMap';
import { getQuestionGroups } from '../../../../lib/columnMap';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey } = req.query;

  try {
    const { headers, sheetName } = await getRoleRows(roleKey);
    const { indexMap, groups } = buildColumnMap(headers);

    // Build a structured template preview
    const classified = headers.map((h, i) => ({
      index: i,
      key: h,
      label: colLabel(h),
      type: classifyColumn(h),
    }));

    const questionGroups = getQuestionGroups(groups[COLUMN_TYPES.RATING] || []);

    return res.status(200).json({
      roleKey,
      sheetName,
      headers,
      classified,
      groups,
      questionGroups,
      totalColumns: headers.length,
    });
  } catch (err) {
    console.error('[template]', err);
    return res.status(500).json({ error: err.message });
  }
}
