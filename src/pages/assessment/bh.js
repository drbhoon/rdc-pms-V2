/**
 * BH Assessment Form
 * URL: /assessment/bh?roleKey=PI&pairId=EMP001_PI_2026_Annual_0001
 *     (add &view=1 for read-only view of finalized pair)
 *
 * BH sees RM values side-by-side for reference.
 * BH may accept or amend, then submits to finalize (row → GREEN).
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import AssessmentForm from '../../components/AssessmentForm';

export default function BhAssessment() {
  const router = useRouter();
  const { roleKey, pairId, view } = router.query;
  const isViewOnly = view === '1';

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
    const r = await fetch('/api/assessment/bh-submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pms-user': 'bh@rdcconcrete.com',
      },
      body: JSON.stringify({ roleKey, pairId, values }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'BH submission failed');
    setSubmitted(true);
    setPairData((prev) => ({
      ...prev,
      bh: d.bhRow,
    }));
  }

  if (!roleKey || !pairId) return null;

  const isLocked =
    pairData?.bh?.LOCK_STATUS === 'Fully Locked' ||
    pairData?.bh?.STATUS === 'Finalized';

  return (
    <Layout title="BH Assessment Form">
      {/* Breadcrumb */}
      <div className="text-xs text-gray-500 mb-4">
        <a href="/admin/employees" className="hover:underline">Employee Selection</a>
        {' → '}BH Assessment
        {pairId && <span className="ml-1 font-mono">({pairId})</span>}
        {isViewOnly && <span className="ml-2 text-gray-400">[View Only]</span>}
      </div>

      {loading && <div className="text-gray-500 py-8 text-center">Loading assessment data…</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-red-700 text-sm">{error}</div>}

      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded px-4 py-3 text-green-700 text-sm mb-4">
          <strong>BH Assessment finalized.</strong> Both RM and BH rows are now locked (green).
          <br />
          <a href="/admin/employees" className="underline mt-1 inline-block">← Back to Employee Selection</a>
          {' | '}
          <a href="/dashboard" className="underline">View Dashboard</a>
        </div>
      )}

      {pairData && (
        <>
          {!pairData.bh && !submitted && (
            <div className="bg-yellow-50 border border-yellow-200 rounded px-4 py-3 text-yellow-700 text-sm mb-4">
              BH row not yet available. RM must submit their assessment first.
            </div>
          )}
          <AssessmentForm
            formType="BH"
            rm={pairData.rm}
            bh={pairData.bh}
            headers={pairData.headers}
            onSubmit={handleSubmit}
            isLocked={isLocked || submitted}
            isViewOnly={isViewOnly}
          />
        </>
      )}
    </Layout>
  );
}
