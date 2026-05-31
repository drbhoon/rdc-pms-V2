/**
 * Layout.js
 * Main application shell with top navigation bar.
 */
import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/dashboard',       label: 'Dashboard' },
  { href: '/admin/roles',     label: 'Role Setup' },
  { href: '/admin/employees', label: 'Employee Selection' },
  { href: '/admin/audit',     label: 'Audit Log' },
];

export default function Layout({ children, title }) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Top Bar ── */}
      <header className="bg-slate-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo / App name */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">RDC PMS</span>
            <span className="text-xs text-slate-400 hidden sm:block">Performance Management System</span>
          </Link>

          {/* Navigation */}
          <nav className="flex gap-1">
            {NAV_ITEMS.map(({ href, label }) => {
              const active = router.pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ── Page Content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {title && (
          <h1 className="text-xl font-semibold text-gray-800 mb-4">{title}</h1>
        )}
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-slate-800 text-slate-400 text-xs text-center py-2">
        RDC Concrete (India) Ltd – PMS v1.0
        {process.env.NEXT_PUBLIC_MOCK_MODE === 'true' && (
          <span className="ml-2 text-yellow-400 font-semibold">[MOCK MODE]</span>
        )}
      </footer>
    </div>
  );
}
