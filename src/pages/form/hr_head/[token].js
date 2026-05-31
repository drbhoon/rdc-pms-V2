/**
 * /form/hr_head/[token] — public HR-HEAD commenter form.
 */
import HrCommenterForm, { makeHrGetServerSideProps } from '../../../components/HrCommenterForm';

export default function HrHeadFormPage({ role, token, data }) {
  return <HrCommenterForm role={role} token={token} data={data} />;
}

export const getServerSideProps = makeHrGetServerSideProps('HR_HEAD');
