/**
 * RM Assessment Form
 * URL: /assessment/rm?roleKey=PI&pairId=EMP001_PI_2026_Annual_0001
 *
 * RM fills ratings and narrative fields, then submits.
 * On submit: RM row → BLUE, BH row created below.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import AssessmentForm from '../../components/AssessmentForm';

export default function RmAssessment() {
  const router = useRouter();
  const { roleKey, pairId } = router.query;

  const [pairData, setPairData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!roleKey || !pairId) return;
    setLoading(true);
    fetch(`/api/assessment/pair?roleKey=${encodeURIComponent(roleKey)}&pairId=${encodeURIComponent(pairId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setPairData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [roleKey, pairId]);

  async function handleSubmit(values) {
    const r = await fetch('/api/assessment/rm-submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pms-user': 'rm@rdcconcrete.com',
      },
      body: JSON.stringify({ roleKey, pairId, values }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'RM submission failed');
    setSubmitted(true);
    setPairData((prev) => ({
      ...prev,
      rm: d.rmRow,
      bh: d.bhRow,
    }));
  }

  if (!roleKey || !pairId) return null;

  const isLocked =
    pairData?.rm?.LOCK_STATUS === 'RM Locked' ||
    pairData?.rm?.LOCK_STATUS === 'Fully Locked' ||
    pairData?.rm?.STATUS === 'RM Submitted' ||
    pairData?.rm?.STATUS === 'Finalized';

  return (
    <Layout title="RM Assessment Form">
      {/* Breadcrumb */}
      <div className="text-xs text-gray-500 mb-4">
        <a href="/admin/employees" className="hover:underline">Employee Selection</a>
        {' → '}RM Assessment
        {pairId && <span className="ml-1 font-mono">({pairId})</span>}
      </div>

      {loading && <div className="text-gray-500 py-8 text-center">Loading assessment data…</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-red-700 text-sm">{error}</div>}

      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded px-4 py-3 text-green-700 text-sm mb-4">
          <strong>RM Assessment submitted successfully.</strong> BH row has been created.
          The RM row is now locked (blue).
          <br />
          <a href="/admin/employees" className="underline mt-1 inline-block">← Back to Employee Selection</a>
          {' | '}
          <a href="/dashboard" className="underline">View Dashboard</a>
        </div>
      )}

      {pairData && (
        <AssessmentForm
          formType="RM"
          rm={pairData.rm}
          bh={pairData.bh}
          headers={pairData.headers}
          onSubmit={handleSubmit}
          isLocked={isLocked || submitted}
        />
      )}
    </Layout>
  );
}
