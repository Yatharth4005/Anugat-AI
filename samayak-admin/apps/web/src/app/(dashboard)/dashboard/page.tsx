'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { AnalyticsDashboard, Day, Period } from '@samayak/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, RadialBarChart, RadialBar, Legend
} from 'recharts';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as Day[];
const PERIODS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'] as Period[];
const PERIOD_LABELS: Record<string, string> = {
  I: '9am', II: '10am', III: '11am', IV: '12pm',
  V: '1pm', VI: '2pm', VII: '3pm', VIII: '4pm', IX: '5pm'
};

function utilisationColor(pct: number): string {
  if (pct >= 80) return '#ef4655';
  if (pct >= 60) return '#f5a524';
  if (pct >= 40) return '#3DA1FF';
  if (pct >= 20) return '#27ae8a';
  return '#dbe6f3';
}

function probabilityColor(prob: number): string {
  if (prob >= 0.7) return '#27ae8a';
  if (prob >= 0.4) return '#3DA1FF';
  if (prob >= 0.2) return '#f5a524';
  return '#ef4655';
}

async function fetchDashboard(): Promise<AnalyticsDashboard> {
  const res = await apiClient.get<{ success: boolean; data: AnalyticsDashboard }>('/api/analytics/dashboard');
  return res.data.data;
}

export default function DashboardPage() {
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30_000, // live update every 30s
    staleTime: 25_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></div>
          <div className="empty-title">Unable to load analytics</div>
          <div className="empty-sub">Check that the API is running and try again.</div>
          <button onClick={() => refetch()} className="btn btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  const updatedTime = new Date(dataUpdatedAt).toLocaleTimeString();
  const computedAt = new Date(data.computedAt).toLocaleTimeString();

  return (
    <div className="page-container">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics Dashboard</h1>
          <p className="page-subtitle">Live timetable utilisation metrics · Last computed {computedAt}</p>
        </div>
        <div className="page-actions">
          <button onClick={() => refetch()} className="btn btn-white btn-sm" id="btn-refresh-analytics">
            <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Hero Stats ── */}
      <div className="grid-4 mb-6">
        <div className="card stat-card">
          <div className="stat-card-accent" />
          <div className="stat-card-label">
            <svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
            Room Utilisation
          </div>
          <div className="stat-card-value">{data.overallUtilisationPct.toFixed(1)}%</div>
          <div className="stat-card-delta" style={{ color: data.overallUtilisationPct > 60 ? 'var(--error)' : 'var(--success)' }}>
            {data.overallUtilisationPct > 60 ? '⚠ High demand' : '✓ Healthy range'}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-card-accent" style={{ background: 'linear-gradient(105deg, #27ae8a, #34d9a8)' }} />
          <div className="stat-card-label">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            Under-Running
          </div>
          <div className="stat-card-value">{data.underRunningCourses.length}</div>
          <div className="stat-card-delta" style={{ color: data.underRunningCourses.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {data.underRunningCourses.length > 0 ? `${data.underRunningCourses.length} course(s) behind schedule` : '✓ All on track'}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-card-accent" style={{ background: 'linear-gradient(105deg, #f5a524, #ffcc55)' }} />
          <div className="stat-card-label">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>
            Avg Empty Hours/Day
          </div>
          <div className="stat-card-value">{data.avgEmptyRoomHoursPerDay.toFixed(1)}h</div>
          <div className="stat-card-delta" style={{ color: 'var(--muted)' }}>
            per room on average
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-card-accent" style={{ background: 'linear-gradient(105deg, #3DA1FF, #7bc8ff)' }} />
          <div className="stat-card-label">
            <svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="15" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            Total Rooms Tracked
          </div>
          <div className="stat-card-value">{data.roomUtilisations.length}</div>
          <div className="stat-card-delta" style={{ color: 'var(--muted)' }}>across all departments</div>
        </div>
      </div>

      {/* ── Grid: Charts + Tables ── */}
      <div className="dashboard-grid-2" style={{ marginBottom: 20 }}>

        {/* Room Utilisation Bar Chart */}
        <div className="card chart-container">
          <div className="chart-title">Room Utilisation per Room</div>
          <div className="chart-sub">Percentage of total available slots occupied</div>
          {data.roomUtilisations.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-sub">No rooms found. Add rooms to see utilisation.</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240} style={{ minHeight: '240px' }}>
              <BarChart data={data.roomUtilisations} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="roomNumber" tick={{ fontSize: 11, fontWeight: 600, fill: '#7c8294' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7c8294' }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', fontSize: 13, fontWeight: 600 }}
                  formatter={(val: number) => [`${val.toFixed(1)}%`, 'Utilisation']}
                />
                <Bar dataKey="utilisationPct" radius={[6, 6, 0, 0]}>
                  {data.roomUtilisations.map((r) => (
                    <Cell key={r.roomId} fill={utilisationColor(r.utilisationPct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* P(Empty Room) per Period */}
        <div className="card chart-container">
          <div className="chart-title">P(Empty Room) per Time Slot</div>
          <div className="chart-sub">Probability of finding a free room for each period (averaged across all days)</div>
          {data.slotAvailabilities.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-sub">No timetable data yet.</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240} style={{ minHeight: '240px' }}>
              <BarChart
                data={PERIODS.map((period) => {
                  const avail = data.slotAvailabilities.filter((s) => s.period === period);
                  const avgProb = avail.length > 0 ? avail.reduce((s, a) => s + a.probability, 0) / avail.length : 0;
                  return { period, label: PERIOD_LABELS[period], probability: avgProb };
                })}
                margin={{ top: 4, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600, fill: '#7c8294' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7c8294' }} domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', fontSize: 13, fontWeight: 600 }}
                  formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'P(empty)'] }
                />
                <Bar dataKey="probability" radius={[6, 6, 0, 0]}>
                  {PERIODS.map((p) => {
                    const avail = data.slotAvailabilities.filter((s) => s.period === p);
                    const avgProb = avail.length > 0 ? avail.reduce((s, a) => s + a.probability, 0) / avail.length : 0;
                    return <Cell key={p} fill={probabilityColor(avgProb)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Room Utilisation Heatmap ── */}
      <div className="card mb-4">
        <div className="chart-container">
          <div className="chart-title">Room × Day Utilisation Heatmap</div>
          <div className="chart-sub">Colour intensity shows how occupied each room is per day</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 4, minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, textAlign: 'left', padding: '6px 10px' }}>Room</th>
                  {DAYS.map((d) => (
                    <th key={d} style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, padding: '6px 10px', textAlign: 'center' }}>
                      {d.slice(0, 3)}
                    </th>
                  ))}
                  <th style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, padding: '6px 10px', textAlign: 'center' }}>Overall</th>
                </tr>
              </thead>
              <tbody>
                {data.roomUtilisations.slice(0, 15).map((room) => (
                  <tr key={room.roomId}>
                    <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      {room.roomNumber}
                    </td>
                    {DAYS.map((day) => {
                      const daySlots = data.slotAvailabilities.filter((s) => s.day === day);
                      const occupied = PERIODS.length - (daySlots.find((s) => s.day === day)?.freeRooms ?? PERIODS.length);
                      const pct = (occupied / PERIODS.length) * 100;
                      return (
                        <td key={day} style={{ padding: '4px' }}>
                          <div
                            className="heatmap-cell"
                            style={{
                              background: utilisationColor(room.utilisationPct),
                              opacity: 0.3 + (room.utilisationPct / 100) * 0.7,
                              fontSize: 10,
                              fontWeight: 700,
                              color: room.utilisationPct > 30 ? '#fff' : '#7c8294',
                            }}
                            title={`${room.roomNumber} on ${day}: ~${room.utilisationPct.toFixed(0)}% utilised`}
                          >
                            {room.utilisationPct > 5 ? `${room.utilisationPct.toFixed(0)}%` : '–'}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ padding: '4px' }}>
                      <div
                        className="heatmap-cell"
                        style={{
                          background: utilisationColor(room.utilisationPct),
                          fontWeight: 800,
                          fontSize: 11,
                          color: '#fff',
                        }}
                      >
                        {room.utilisationPct.toFixed(0)}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Under-Running Courses ── */}
      <div className="card">
        <div className="chart-container" style={{ paddingBottom: 0 }}>
          <div className="chart-title">Under-Running Courses</div>
          <div className="chart-sub">Courses where scheduled contact slots fall short of credit-hour requirement</div>
        </div>
        {data.underRunningCourses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg></div>
            <div className="empty-title">All courses on track!</div>
            <div className="empty-sub">No under-running courses detected in the current timetable.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Branch / Semester</th>
                  <th>Credits</th>
                  <th>Required Slots</th>
                  <th>Scheduled</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {data.underRunningCourses.map((c) => (
                  <tr key={c.courseId}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.courseCode}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{c.courseName}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.branchName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Semester {c.semester}</div>
                    </td>
                    <td><span className="badge badge-blue">{c.credits} cr</span></td>
                    <td style={{ fontWeight: 700 }}>{c.requiredSlots}</td>
                    <td style={{ fontWeight: 700 }}>{c.scheduledSlots}</td>
                    <td>
                      <span className="badge badge-red">-{c.gap} slot{c.gap > 1 ? 's' : ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="page-container">
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ height: 30, width: 220, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 18, width: 320 }} />
      </div>
      <div className="grid-4 mb-6">
        {[1,2,3,4].map((i) => (
          <div key={i} className="card" style={{ padding: 24, height: 120 }}>
            <div className="skeleton" style={{ height: 14, width: 100, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 42, width: 80 }} />
          </div>
        ))}
      </div>
      <div className="dashboard-grid-2">
        <div className="card" style={{ padding: 24, height: 300 }}>
          <div className="skeleton" style={{ height: 18, width: 180, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 240 }} />
        </div>
        <div className="card" style={{ padding: 24, height: 300 }}>
          <div className="skeleton" style={{ height: 18, width: 200, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      </div>
    </div>
  );
}
