'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { Faculty, Department, PaginatedResponse } from '@samayak/types';
import { Role } from '@samayak/types';
import { useToast } from '@/components/ToastContext';

const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Admin', COORDINATOR: 'Coordinator', HOD: 'HOD', DEAN: 'Dean', PROFESSOR: 'Professor' };

function getRoleBadgeStyle(role: Role) {
  switch (role) {
    case Role.ADMIN:
      return { background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2', fontWeight: 800 };
    case Role.COORDINATOR:
      return { background: '#e3f2fd', color: '#1565c0', border: '1px solid #bbdefb', fontWeight: 800 };
    case Role.HOD:
      return { background: '#fff3e0', color: '#ef6c00', border: '1px solid #ffe0b2', fontWeight: 800 };
    case Role.DEAN:
      return { background: '#f3e5f5', color: '#6a1b9a', border: '1px solid #e1bee7', fontWeight: 800 };
    case Role.PROFESSOR:
      return { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9', fontWeight: 800 };
    default:
      return {};
  }
}

async function fetchFaculty(page: number, search: string, role: string, showArchived: boolean) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20', search });
  if (role) params.set('role', role);
  if (showArchived) params.set('archived', 'true');
  const res = await apiClient.get<PaginatedResponse<Faculty> & { success: boolean }>(`/api/faculty?${params}`);
  return res.data;
}

export default function FacultyPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['faculty', page, search, filterRole, showArchived],
    queryFn: () => fetchFaculty(page, search, filterRole, showArchived),
    placeholderData: (prev) => prev,
  });

  const { data: depts } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: Department[] }>('/api/departments?pageSize=100');
      return res.data.data;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/faculty/${id}`),
    onSuccess: () => { 
      toast('Faculty member archived. Recoverable within 30 days.', 'success'); 
      qc.invalidateQueries({ queryKey: ['faculty'] }); 
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/api/faculty/${id}/restore`),
    onSuccess: () => { 
      toast('Faculty member restored', 'success'); 
      qc.invalidateQueries({ queryKey: ['faculty'] }); 
    },
    onError: (err: unknown) => { 
      toast((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Restore failed', 'error'); 
    },
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Faculty & Users</h1>
          <p className="page-subtitle">Manage faculty members, roles, and access</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-white btn-sm" id="btn-import-faculty" onClick={() => setShowImportModal(true)}>
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Import CSV (Preview)
          </button>
          <button className="btn btn-primary btn-sm" id="btn-add-faculty" onClick={() => setShowDrawer(true)}>
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Faculty
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-row">
        <div className="search-bar">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Search name, email, initials..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input" value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1); }}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} style={{ width: 16, height: 16 }} />
          Show Archived
        </label>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Faculty Member</th>
              <th>Initials</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>)
            ) : !data?.data?.length ? (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div>
                  <div className="empty-title">No faculty members found</div>
                  <div className="empty-sub">Add faculty or import from CSV</div>
                </div>
              </td></tr>
            ) : (
              data.data.map((f) => {
                const initials2 = f.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <tr key={f.id} style={{ opacity: f.deletedAt ? 0.6 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--gradient)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                          {initials2}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700 }}>{f.name}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{f.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{ background: 'var(--canvas-2)', padding: '3px 8px', borderRadius: 6, fontSize: 12.5, fontWeight: 700 }}>{f.initials}</code></td>
                    <td>
                      <span className="badge" style={getRoleBadgeStyle(f.role)}>
                        {ROLE_LABELS[f.role]}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{(f as Faculty & { department?: { name: string } }).department?.name ?? '—'}</td>
                    <td>
                      {f.deletedAt ? (
                        <span className="badge badge-red">Archived</span>
                      ) : (
                        <span className="badge badge-green">Active</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!f.deletedAt ? (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditingFaculty(f); setShowDrawer(true); }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => archiveMutation.mutate(f.id)}>Archive</button>
                          </>
                        ) : (
                          <button className="btn btn-white btn-sm" onClick={() => restoreMutation.mutate(f.id)}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.total)} of {data.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showDrawer && (
        <FacultyDrawer
          faculty={editingFaculty}
          depts={depts ?? []}
          onClose={() => { setShowDrawer(false); setEditingFaculty(null); }}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['faculty'] }); toast(editingFaculty ? 'Faculty updated' : 'Faculty added', 'success'); setShowDrawer(false); setEditingFaculty(null); }}
        />
      )}

      {showImportModal && (
        <FacultyImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['faculty'] }); setShowImportModal(false); }}
        />
      )}
    </div>
  );
}

function FacultyDrawer({ faculty, depts, onClose, onSuccess }: { faculty: Faculty | null; depts: Department[]; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(faculty?.name ?? '');
  const [email, setEmail] = useState(faculty?.email ?? '');
  const [initials, setInitials] = useState(faculty?.initials ?? '');
  const [role, setRole] = useState<Role>(faculty?.role ?? Role.PROFESSOR);
  const [deptId, setDeptId] = useState(faculty?.departmentId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload = { name, email, initials: initials.toUpperCase(), role, departmentId: deptId || null };
      if (faculty) await apiClient.patch(`/api/faculty/${faculty.id}`, payload);
      else await apiClient.post('/api/faculty', payload);
      onSuccess();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{faculty ? 'Edit Faculty' : 'Add Faculty'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="drawer-body">
            <div className="field-group">
              <label className="field-label">Full Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Dr. First Last" required />
            </div>
            <div className="field-group">
              <label className="field-label">Email Address</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="faculty@institution.edu" required />
            </div>
            <div className="grid-2">
              <div className="field-group">
                <label className="field-label">Initials</label>
                <input className="input" value={initials} onChange={e => setInitials(e.target.value.toUpperCase())} placeholder="e.g. VKB" required maxLength={6} />
                <span className="input-hint">Used in timetable cell references</span>
              </div>
              <div className="field-group">
                <label className="field-label">Role</label>
                <select className="input" value={role} onChange={e => setRole(e.target.value as Role)}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Department</label>
              <select className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
                <option value="">No Department association</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {!faculty && (
              <div style={{ background: '#eef5ff', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--brand-deep)', fontWeight: 600 }}>
                Default password: <code>Samayak@2024</code> — user should change on first login.
              </div>
            )}
            {error && <div style={{ background: '#fdecee', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>{error}</div>}
          </div>
          <div className="drawer-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {faculty ? 'Save Changes' : 'Add Faculty'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

interface FacultyPreviewItem {
  rowIndex: number;
  name: string;
  email: string;
  role: string;
  initials: string;
  departmentId: string | null;
  departmentName: string;
  status: 'NEW' | 'DUPLICATE';
  existingRecord: { id: string; name: string } | null;
}

function FacultyImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errDetails, setErrDetails] = useState<any[]>([]);
  const [preview, setPreview] = useState<FacultyPreviewItem[] | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'merge'>('skip');
  const [report, setReport] = useState<any | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setPreview(null);
    setReport(null);
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      setFile(selected);
      // Automatically trigger preview
      setLoading(true);
      const formData = new FormData();
      formData.append('file', selected);
      try {
        const res = await apiClient.post<{ success: boolean; data: FacultyPreviewItem[] }>(
          '/api/faculty/import/preview',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setPreview(res.data.data);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? 'Failed to parse file preview');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setLoading(true);
    setError('');
    setErrDetails([]);
    try {
      const res = await apiClient.post<{ success: boolean; data: any }>(
        '/api/faculty/import/commit',
        {
          rows: preview
            .filter(p => p.name && p.email)
            .map(p => ({
              name: p.name.trim(),
              email: p.email.trim(),
              role: p.role,
              initials: p.initials.trim(),
              departmentId: p.departmentId,
            })),
          duplicateAction,
        }
      );
      setReport(res.data.data);
      toast('Import completed', 'success');
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to commit import');
      setErrDetails(err?.response?.data?.details ?? []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 800, width: '95%' }}>
        <div className="modal-header">
          <div className="modal-title">Import Faculty Members</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--muted)' }} disabled={loading}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {!preview && !report && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ color: 'var(--ink-soft)', marginBottom: 20 }}>
                Upload spreadsheet containing: <code>Name</code>, <code>Email</code>, <code>Initials</code>, <code>Role</code>, and <code>Department</code>.
              </p>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Select Spreadsheet File'}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx" style={{ display: 'none' }} />
              {error && <div style={{ color: 'var(--error)', marginTop: 16, fontWeight: 600 }}>{error}</div>}
            </div>
          )}

          {preview && !report && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Spreadsheet Preview ({preview.length} rows)</div>
              
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ margin: 0, width: '100%' }}>
                  <thead style={{ background: 'var(--canvas-2)', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 12px', fontSize: 11.5 }}>Row</th>
                      <th style={{ padding: '8px 12px', fontSize: 11.5, textAlign: 'left' }}>Name</th>
                      <th style={{ padding: '8px 12px', fontSize: 11.5, textAlign: 'left' }}>Email</th>
                      <th style={{ padding: '8px 12px', fontSize: 11.5, textAlign: 'left' }}>Initials</th>
                      <th style={{ padding: '8px 12px', fontSize: 11.5, textAlign: 'left' }}>Department</th>
                      <th style={{ padding: '8px 12px', fontSize: 11.5, textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--line)', background: p.status === 'DUPLICATE' ? '#fff8e0' : 'none' }}>
                        <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700, fontSize: 12.5, color: 'var(--muted)' }}>{p.rowIndex}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12.5 }}>{p.email}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}><code style={{ background: 'var(--canvas-2)', padding: '2px 6px', borderRadius: 4 }}>{p.initials}</code></td>
                        <td style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--ink-soft)' }}>{p.departmentName || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`badge ${p.status === 'DUPLICATE' ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 11 }}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Duplicate conflict handling */}
              <div style={{ background: 'var(--canvas-2)', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5 }}>Duplicate Action</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Choose what to do when an email already exists in the system.</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                    <input type="radio" checked={duplicateAction === 'skip'} onChange={() => setDuplicateAction('skip')} />
                    Skip Duplicate
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                    <input type="radio" checked={duplicateAction === 'merge'} onChange={() => setDuplicateAction('merge')} />
                    Merge & Overwrite
                  </label>
                </div>
              </div>

              {error && (
                <div style={{ color: 'var(--error)', fontWeight: 600, fontSize: 13.5 }}>
                  {error}
                  {errDetails && errDetails.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 12, fontWeight: 500, listStyle: 'disc' }}>
                      {errDetails.map((det: any, idx: number) => (
                        <li key={idx} style={{ marginTop: 4 }}>
                          Row Field <code>{det.field}</code>: {det.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {report && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 100, background: '#e9f7f1', border: '1.5px solid #b8e9d5', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1c7a5c', textTransform: 'uppercase', marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1c7a5c' }}>{report.created ?? 0}</div>
                </div>
                <div style={{ flex: 1, minWidth: 100, background: '#eef5ff', border: '1.5px solid #cce0ff', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-deep)', textTransform: 'uppercase', marginBottom: 4 }}>Merged</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-deep)' }}>{report.merged ?? 0}</div>
                </div>
                <div style={{ flex: 1, minWidth: 100, background: 'var(--canvas-2)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Skipped</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{report.skipped ?? 0}</div>
                </div>
              </div>

              {report.errors && report.errors.length > 0 && (
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--error)', marginBottom: 8 }}>Failures during commit</div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                    {report.errors.map((err: any, idx: number) => (
                      <div key={idx} style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 13, color: 'var(--error)' }}>
                        <strong>{err.email}:</strong> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            {report ? 'Done' : 'Cancel'}
          </button>
          {preview && !report && (
            <button className="btn btn-primary" onClick={handleCommit} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Commit Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
