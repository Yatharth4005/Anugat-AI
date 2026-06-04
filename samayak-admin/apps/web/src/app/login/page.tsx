'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/apiClient';
import type { LoginResponse } from '@samayak/types';

const DEMO_ACCOUNTS = [
  { label: 'Demo Admin', email: 'admin@samayak.edu', password: 'Admin@2024', role: 'ADMIN' },
  { label: 'Demo Coordinator', email: 'coordinator@samayak.edu', password: 'Coord@2024', role: 'COORDINATOR' },
  { label: 'Demo Faculty', email: 'faculty@samayak.edu', password: 'Faculty@2024', role: 'PROFESSOR' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await apiClient.post<{ success: boolean; data: LoginResponse }>('/api/auth/login', {
        email,
        password,
      });

      const { token, user } = res.data.data;
      login(token, user);
      // Sync to localStorage for axios interceptor
      localStorage.setItem('samayak_token', token);
      localStorage.setItem('samayak_user', JSON.stringify(user));
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Login failed. Check credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function quickLogin(acc: (typeof DEMO_ACCOUNTS)[0]) {
    setEmail(acc.email);
    setPassword(acc.password);
    setLoading(true);
    setError('');

    try {
      const res = await apiClient.post<{ success: boolean; data: LoginResponse }>('/api/auth/login', {
        email: acc.email,
        password: acc.password,
      });

      const { token, user } = res.data.data;
      login(token, user);
      localStorage.setItem('samayak_token', token);
      localStorage.setItem('samayak_user', JSON.stringify(user));
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Demo login failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--canvas)' }}>
      {/* ── Left: Brand panel ── */}
      <div
        style={{
          flex: '0 0 480px',
          background: 'var(--gradient)',
          padding: '60px 52px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
        className="login-brand-panel"
      >
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -40, width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 48 }}>
            <div style={{ width: 46, height: 46, background: 'rgba(255,255,255,0.2)', borderRadius: 13, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 900, color: '#fff', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.3)' }}>
              S
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em' }}>Samayak</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin Panel</div>
            </div>
          </div>

          <h1 style={{ color: '#fff', fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 16 }}>
            Academic<br />Operations<br />Platform
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 1.65, maxWidth: 340 }}>
            Manage departments, rooms, courses, and faculty. Analyse timetable utilisation with live analytics.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['BIT Mesra', 'Spring 2026', 'CSE Department'].map((tag) => (
              <span key={tag} style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.25)', padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: '#fff' }}>
                {tag}
              </span>
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20, fontWeight: 600 }}>
            © 2026 Anugat AI. Confidential.
          </p>
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em', marginBottom: 6 }}>
            Sign in to Samayak
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14.5, fontWeight: 500, marginBottom: 32 }}>
            Enter your credentials or use a demo account below.
          </p>

          {/* ── Demo Login Section ── */}
          <div style={{ background: 'var(--canvas-2)', border: '1.5px solid var(--line-2)', borderRadius: 'var(--r-card)', padding: '20px 22px', marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14 }}>
              Try Demo Login
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  id={`demo-${acc.role.toLowerCase()}`}
                  onClick={() => quickLogin(acc)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    minWidth: 120,
                    padding: '10px 14px',
                    borderRadius: 'var(--r-pill)',
                    background: '#fff',
                    border: '1.5px solid var(--line)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--brand-deep)',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    boxShadow: 'var(--sh-sm)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gradient)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.border = '1.5px solid transparent'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--brand-deep)'; e.currentTarget.style.border = '1.5px solid var(--line)'; }}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>or sign in manually</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* ── Login Form ── */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field-group">
              <label className="field-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@institution.edu"
                required
                autoComplete="email"
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{ background: '#fdecee', border: '1.5px solid #f9cdd0', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: 'var(--error)' }}>
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 4, justifyContent: 'center' }}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 24, fontWeight: 500 }}>
            Default password for new accounts: <code style={{ background: 'var(--canvas-2)', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>Samayak@2024</code>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-brand-panel { display: none; }
        }
      `}</style>
    </div>
  );
}
