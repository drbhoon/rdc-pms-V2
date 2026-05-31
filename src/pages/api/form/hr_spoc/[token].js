/**
 * /api/form/hr_spoc/[token] — HR_SPOC commenter form data + submit.
 * Thin wrapper around the shared HR form handler factory.
 */
import { makeHrFormHandler } from '../../../../lib/hrFormHandler';

export default makeHrFormHandler('HR_SPOC');
