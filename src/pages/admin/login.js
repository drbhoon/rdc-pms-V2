/**
 * admin/login.js
 * Full-screen login page for HR admins. No AdminLayout.
 */
import { useState } from 'react';
import { useRouter } from 'next/router';
import BrandLogo from '../../components/BrandLogo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid credentials. Please try again.');
      } else {
        router.push('/admin');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 lg:py-[4vh] flex items-center">
      <div className="mx-auto w-full max-w-[1180px] grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] items-center">
        {/* Welcome panel — the LMS's light hero */}
        <section className="hidden lg:flex min-h-[600px] flex-col justify-between rounded-2xl border border-[#cfe7d6] bg-gradient-to-br from-white to-[#eef7f1] p-10 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 text-navy font-extrabold">
            <BrandLogo imgClassName="h-12" className="px-2 py-1.5 border border-slate-200" />
            <span>RDC Concrete (India) Ltd</span>
          </div>
          <div>
            <h1 className="text-5xl xl:text-6xl font-extrabold leading-none tracking-tight text-navy max-w-[760px]">
              PARAKH<br /><span className="text-blue-600">Performance Management</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 max-w-[620px]">
              Appraisals from launch to sign-off: Level 1, Level 2 and the HR stages, in one place.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-[620px]">
            {['Launch from the employee master', 'Reviewers work from one link', 'Reports ready to download'].map((t) => (
              <div key={t} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-navy shadow-sm">{t}</div>
            ))}
          </div>
        </section>

      <div className="relative w-full max-w-md mx-auto">
        {/* Branding (phones and small screens) */}
        <div className="text-center mb-6 lg:hidden">
          <div className="mb-3 flex justify-center">
            <BrandLogo imgClassName="h-10" className="px-2 py-1.5 border border-slate-200" />
          </div>
          <h1 className="text-2xl font-extrabold text-navy tracking-tight">PARAKH</h1>
          <p className="mt-1 text-sm text-slate-500">
            Performance Management – HR Console
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lift p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Sign in to your account</h2>
          <p className="text-sm text-slate-500 mb-6">Enter your HR admin credentials to continue</p>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 shrink-0 w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hr@rdcconcrete.com"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} RDC Concrete (India) Ltd. — Internal HR System
        </p>
      </div>
      </div>
    </div>
  );
}
