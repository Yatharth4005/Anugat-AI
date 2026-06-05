'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/apiClient';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
    ),
  },
  {
    href: '/departments',
    label: 'Departments',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9,22 9,12 15,12 15,22" /></svg>
    ),
  },
  {
    href: '/rooms',
    label: 'Rooms',
    icon: (
      <svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="15" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
    ),
  },
  {
    href: '/courses',
    label: 'Courses',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    ),
  },
  {
    href: '/faculty',
    label: 'Faculty & Users',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    ),
  },
  {
    href: '/pdf-ingestion',
    label: 'PDF Ingestion',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
    ),
    highlight: true,
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);

    const checkHydrated = () => {
      if (useAuthStore.persist.hasHydrated()) {
        setHydrated(true);
        return true;
      }
      return false;
    };

    if (!checkHydrated()) {
      const unsub = useAuthStore.persist.onFinishHydration(() => {
        setHydrated(true);
      });
      return () => unsub();
    }
  }, []);

  useEffect(() => {
    if (mounted && hydrated && !isAuthenticated) {
      router.replace('/login');
    }
  }, [mounted, hydrated, isAuthenticated, router]);

  if (!mounted || !hydrated || !isAuthenticated || !user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function handleLogout() {
    try {
      await apiClient.post('/api/auth/logout');
    } catch { /* ignore */ }
    logout();
    localStorage.removeItem('samayak_token');
    localStorage.removeItem('samayak_user');
    router.replace('/login');
  }

  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">S</div>
          <div>
            <span style={{ display: 'block' }}>Samayak</span>
            <span className="sidebar-brand-sub">Admin Panel</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
                id={`nav-${item.href.slice(1) || 'dashboard'}`}
              >
                {item.icon}
                {item.label}
                {item.highlight && !isActive && (
                  <span style={{ marginLeft: 'auto', background: 'var(--gradient)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999 }}>
                    NEW
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-logout" id="btn-logout">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16,17 21,12 16,7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
