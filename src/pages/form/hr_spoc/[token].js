/**
 * /form/hr_spoc/[token] — public HR-SPOC commenter form.
 */
import HrCommenterForm, { makeHrGetServerSideProps } from '../../../components/HrCommenterForm';

export default function HrSpocFormPage({ role, token, data }) {
  return <HrCommenterForm role={role} token={token} data={data} />;
}

export const getServerSideProps = makeHrGetServerSideProps('HR_SPOC');
