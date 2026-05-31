/**
 * AdminLayout.js
 * Full-screen sidebar layout for the HR Admin console.
 */
import { useRouter } from 'next/router';
import Link from 'next/link';
import clsx from 'clsx';

const NAV = [
  {
    section: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: IconDashboard },
    ],
  },
  {
    section: 'Setup',
    items: [
      { href: '/admin/setup',     label: 'Role Templates',  icon: IconTemplate },
      { href: '/admin/employees', label: 'Employees',       icon: IconEmployees },
    ],
  },
  {
    section: 'Assessments',
    items: [
      { href: '/admin/assessments', label: 'Cycle Management', icon: IconCycle },
      { href: '/admin/audit',       label: 'Audit & Unlock',   icon: IconAudit },
      { href: '/admin/reports',     label: 'Reports',          icon: IconReports },
    ],
  },
];

export default function AdminLayout({ children, user, title }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 flex flex-col bg-[#0f172a] text-white shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-sm">
              RDC
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">Performance</div>
              <div className="text-xs text-slate-400 leading-tight">Management System</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map((group) => (
            <div key={group.section} className="mb-6">
              <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {group.section}
              </div>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = router.pathname === href;
                return (
                  <Link key={href} href={href}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-all',
                      active
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                    )}>
                    <Icon size={17} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold uppercase">
              {user?.name?.[0] || 'H'}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-medium truncate">{user?.name || 'HR Admin'}</div>
              <div className="text-xs text-slate-500 truncate">{user?.role === 'HR_SUPER_ADMIN' ? 'Super Admin' : 'HR Admin'}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-all text-left">
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
            Live
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Inline SVG icons ───────────────────────────────────────────────────────

function IconDashboard({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}
function IconTemplate({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
    </svg>
  );
}
function IconEmployees({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconCycle({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}
function IconAudit({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}
function IconReports({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
      <polyline points="8,9 8,9"/>
    </svg>
  );
}
