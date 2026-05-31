/**
 * /api/form/coto/[token] — COTO commenter form data + submit.
 * Thin wrapper around the shared HR form handler factory.
 */
import { makeHrFormHandler } from '../../../../lib/hrFormHandler';

export default makeHrFormHandler('COTO');
