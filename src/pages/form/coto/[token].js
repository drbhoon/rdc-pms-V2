/**
 * /form/coto/[token] — public COTO approval + comment form.
 */
import HrCommenterForm, { makeHrGetServerSideProps } from '../../../components/HrCommenterForm';

export default function CotoFormPage({ role, token, data }) {
  return <HrCommenterForm role={role} token={token} data={data} />;
}

export const getServerSideProps = makeHrGetServerSideProps('COTO');
