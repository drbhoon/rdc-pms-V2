/**
 * /api/form/hr_head/[token] — HR_HEAD commenter form data + submit.
 * Thin wrapper around the shared HR form handler factory.
 */
import { makeHrFormHandler } from '../../../../lib/hrFormHandler';

export default makeHrFormHandler('HR_HEAD');
