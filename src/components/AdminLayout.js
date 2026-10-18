/**
 * AdminLayout.js
 * The HR Admin console's frame, in the LMS's look.
 *
 * One list of links, drawn three ways: a navy sidebar on a laptop (it can
 * shrink to icons, and remembers that), and on a phone a slim header, a bar of
 * tabs along the bottom and a "More" sheet for the rest plus Sign out. CSS in
 * globals.css decides which shows, so nothing flickers on load.
 *
 * The page title sits in a deep-blue banner at the top of the content, with a
 * line about what the page is for.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import BrandLogo from './BrandLogo';

const NAV = [
  {
    section: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', short: 'Home', icon: IconDashboard },
    ],
  },
  {
    section: 'Setup',
    items: [
      { href: '/admin/setup',     label: 'Role Templates',  short: 'Templates', icon: IconTemplate },
      { href: '/admin/employees', label: 'Employees',       short: 'Employees', icon: IconEmployees },
    ],
  },
  {
    section: 'Assessments',
    items: [
      // Sits above Cycle Management because it is now the way a cycle starts:
      // pick people from the shared master rather than uploading a spreadsheet.
      { href: '/admin/launch',      label: 'Launch from Master', short: 'Launch', icon: IconLaunch },
      { href: '/admin/assessments', label: 'Cycle Management', short: 'Cycles', icon: IconCycle },
      { href: '/admin/audit',       label: 'Audit & Unlock',   short: 'Audit', icon: IconAudit },
      { href: '/admin/reports',     label: 'Reports',          short: 'Reports', icon: IconReports },
    ],
  },
  {
    section: 'Polls',
    items: [
      { href: '/admin/polls', label: 'Polls', short: 'Polls', icon: IconPoll },
    ],
  },
];

const ALL = NAV.flatMap((g) => g.items);

// What each page is for, shown under its title in the banner.
const SUBTITLES = {
  '/admin': 'Where every appraisal stands, by template and cycle. Refreshes every 30 seconds.',
  '/admin/setup': 'Upload an assessment Excel to create a template, and manage the template library.',
  '/admin/employees': 'Upload employee lists from Excel and see who is on each template.',
  '/admin/launch': 'Pick people from the employee master and start their appraisals.',
  '/admin/assessments': 'Launch, follow and resend appraisals cycle by cycle.',
  '/admin/audit': 'The audit log, and unlocking a finalised assessment (Super Admin only).',
  '/admin/reports': 'Results by template and cycle, ready to download.',
  '/admin/polls': 'Quick votes: a leader, a best presentation, a best participant.',
};

// Phone tabs: the four most used pages; the rest live under "More".
const TABS = ['/admin', '/admin/launch', '/admin/assessments', '/admin/polls'];

const initials = (name) =>
  String(name || 'H').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || 'H';

export default function AdminLayout({ children, user, title }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // The collapsed sidebar is remembered per browser. Storage can be blocked;
  // the menu then simply starts expanded.
  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem('parakh-sidebar') === 'collapsed'; } catch { /* stay expanded */ }
    if (saved) {
      document.documentElement.dataset.sidebar = 'collapsed';
      setCollapsed(true);
    }
  }, []);
  // Moving to another page closes the More sheet.
  useEffect(() => { setSheetOpen(false); }, [router.pathname]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.sidebar = 'collapsed';
    else delete document.documentElement.dataset.sidebar;
    try { localStorage.setItem('parakh-sidebar', next ? 'collapsed' : 'expanded'); } catch { /* not remembered */ }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  const isActive = (href) => router.pathname === href;
  const name = user?.name || 'HR Admin';
  const roleLabel = user?.role === 'HR_SUPER_ADMIN' ? 'Super Admin' : 'HR Admin';
  const current = ALL.find((i) => isActive(i.href));
  const HeroIcon = current?.icon || IconDashboard;
  const tabs = TABS.map((href) => ALL.find((i) => i.href === href));
  const more = ALL.filter((i) => !TABS.includes(i.href));

  const brand = (
    <Link href="/admin" className="pk-brand">
      <BrandLogo />
      <span className="pk-brand-text">
        <strong>PARAKH</strong>
        <span>Performance Mgmt</span>
      </span>
    </Link>
  );

  return (
    <div className="pk-shell">
      {/* ── Laptop: sidebar ── */}
      <aside className="pk-sidebar" aria-label="Main navigation">
        <div className="pk-sidebar-top">
          {brand}
          <button type="button" className="pk-toggle" onClick={toggleSidebar}
                  aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <IconChevronsRight size={18} /> : <IconChevronsLeft size={18} />}
          </button>
        </div>

        <nav className="pk-nav">
          {NAV.map((group) => (
            <div key={group.section} className="pk-nav-section">
              <div className="pk-nav-heading">{group.section}</div>
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={isActive(href) ? 'active' : undefined}
                      aria-current={isActive(href) ? 'page' : undefined} title={label}>
                  <Icon size={19} />
                  <span className="pk-nav-label">{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="pk-side-user">
          <div className="pk-avatar" aria-hidden="true">{initials(name)}</div>
          <div className="pk-user-text"><strong>{name}</strong><span>{roleLabel}</span></div>
          <button type="button" onClick={handleLogout} className="pk-signout">Sign out</button>
        </div>
      </aside>

      {/* ── Phone: slim header ── */}
      <header className="pk-mobilebar">
        {brand}
        <div className="pk-avatar" aria-hidden="true" style={{ width: 32, height: 32, flexBasis: 32, fontSize: '.75rem' }}>{initials(name)}</div>
      </header>

      <div className="pk-main">
        <main className="pk-content">
          <section className="pk-hero">
            <div className="pk-hero-text">
              <h1>{title}</h1>
              {SUBTITLES[router.pathname] && <p>{SUBTITLES[router.pathname]}</p>}
            </div>
            <span className="pk-hero-live"><i aria-hidden="true" />Live</span>
            <span className="pk-hero-icon" aria-hidden="true"><HeroIcon size={150} strokeWidth={1.2} /></span>
          </section>
          {children}
        </main>
      </div>

      {/* ── Phone: tabs along the bottom ── */}
      <nav className="pk-tabbar" aria-label="Main navigation">
        {tabs.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} className={isActive(href) ? 'active' : undefined}
                aria-current={isActive(href) ? 'page' : undefined}>
            <Icon size={22} /><span>{short}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setSheetOpen(true)} aria-expanded={sheetOpen}
                className={sheetOpen || more.some((i) => isActive(i.href)) ? 'active' : undefined}>
          <IconMore size={22} /><span>More</span>
        </button>
      </nav>

      {sheetOpen && (
        <div className="pk-sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="pk-sheet" role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <div className="pk-sheet-head">
              <div className="pk-avatar" aria-hidden="true">{initials(name)}</div>
              <div className="pk-user-text"><strong>{name}</strong><span>{roleLabel}</span></div>
              <button type="button" className="pk-icon-button" aria-label="Close" onClick={() => setSheetOpen(false)}>
                <IconX size={20} />
              </button>
            </div>
            <nav className="pk-sheet-links">
              {more.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={isActive(href) ? 'active' : undefined}>
                  <Icon size={20} />{label}
                </Link>
              ))}
            </nav>
            <button type="button" onClick={handleLogout} className="pk-signout">Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons (same strokes as the LMS's lucide set) ─────────────────

function Svg({ size = 20, strokeWidth = 2, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function IconDashboard(p) {
  return <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>;
}
function IconTemplate(p) {
  return <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></Svg>;
}
function IconEmployees(p) {
  return <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>;
}
function IconLaunch(p) {
  return <Svg {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></Svg>;
}
function IconCycle(p) {
  return <Svg {...p}><polyline points="23,4 23,10 17,10" /><polyline points="1,20 1,14 7,14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></Svg>;
}
function IconAudit(p) {
  return <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></Svg>;
}
function IconReports(p) {
  return <Svg {...p}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></Svg>;
}
function IconPoll(p) {
  return <Svg {...p}><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /></Svg>;
}
function IconMore(p) {
  return <Svg {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></Svg>;
}
function IconX(p) {
  return <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
}
function IconChevronsLeft(p) {
  return <Svg {...p}><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></Svg>;
}
function IconChevronsRight(p) {
  return <Svg {...p}><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></Svg>;
}
