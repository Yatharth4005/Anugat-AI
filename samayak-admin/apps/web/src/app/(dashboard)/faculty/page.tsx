'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { Faculty, PaginatedResponse } from '@samayak/types';
import { Role } from '@samayak/types';
import { useToast } from '@/components/ToastContext';

const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Admin', COORDINATOR: 'Coordinator', HOD: 'HOD', DEAN: 'Dean', PROFESSOR: 'Professor' };

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

  const { data, isLoading } = useQuery({
    queryKey: ['faculty', page, search, filterRole, showArchived],
    queryFn: () => fetchFaculty(page, search, filterRole, showArchived),
    placeholderData: (prev) => prev,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/faculty/${id}`),
    onSuccess: () => { toast('Faculty member archived. Recoverable within 30 days.', 'success'); qc.invalidateQueries({queryKey:['faculty']}); },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/api/faculty/${id}/restore`),
    onSuccess: () => { toast('Faculty member restored', 'success'); qc.invalidateQueries({queryKey:['faculty']}); },
    onError: (err: unknown) => { toast((err as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Restore failed', 'error'); },
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Faculty & Users</h1>
          <p className="page-subtitle">Manage faculty members, roles, and access</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-white btn-sm" id="btn-import-faculty">
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
          <input placeholder="Search name, email, initials..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
        </div>
        <select className="input" value={filterRole} onChange={e=>{setFilterRole(e.target.value);setPage(1);}}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13.5,fontWeight:600,color:'var(--ink-soft)',cursor:'pointer', whiteSpace: 'nowrap'}}>
          <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} style={{width:16,height:16}} />
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
              Array.from({length:6}).map((_,i) => <tr key={i}>{Array.from({length:6}).map((_,j) => <td key={j}><div className="skeleton" style={{height:16}} /></td>)}</tr>)
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
                const initials2 = f.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                return (
                  <tr key={f.id} style={{opacity: f.deletedAt ? 0.6 : 1}}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:34,height:34,borderRadius:10,background:'var(--gradient)',display:'grid',placeItems:'center',color:'#fff',fontWeight:800,fontSize:12,flexShrink:0}}>
                          {initials2}
                        </div>
                        <div>
                          <div style={{fontWeight:700}}>{f.name}</div>
                          <div style={{fontSize:12.5,color:'var(--muted)'}}>{f.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{background:'var(--canvas-2)',padding:'3px 8px',borderRadius:6,fontSize:12.5,fontWeight:700}}>{f.initials}</code></td>
                    <td><span className={`badge role-${f.role}`}>{ROLE_LABELS[f.role]}</span></td>
                    <td style={{fontSize:13,color:'var(--ink-soft)'}}>{(f as Faculty & {department?:{name:string}}).department?.name ?? '—'}</td>
                    <td>
                      {f.deletedAt ? (
                        <span className="badge badge-red">Archived</span>
                      ) : (
                        <span className="badge badge-green">Active</span>
                      )}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        {!f.deletedAt ? (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => {setEditingFaculty(f);setShowDrawer(true);}}>Edit</button>
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
            <span className="pagination-info">Showing {((page-1)*20)+1}–{Math.min(page*20, data.total)} of {data.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>‹</button>
              {Array.from({length:Math.min(5,data.totalPages)},(_,i)=>i+1).map(p => (
                <button key={p} className={`page-btn ${p===page?'active':''}`} onClick={()=>setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={page>=data.totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showDrawer && (
        <FacultyDrawer
          faculty={editingFaculty}
          onClose={() => {setShowDrawer(false);setEditingFaculty(null);}}
          onSuccess={() => {qc.invalidateQueries({queryKey:['faculty']});toast(editingFaculty?'Faculty updated':'Faculty added','success');setShowDrawer(false);setEditingFaculty(null);}}
        />
      )}
    </div>
  );
}

function FacultyDrawer({ faculty, onClose, onSuccess }: { faculty: Faculty | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(faculty?.name ?? '');
  const [email, setEmail] = useState(faculty?.email ?? '');
  const [initials, setInitials] = useState(faculty?.initials ?? '');
  const [role, setRole] = useState<Role>(faculty?.role ?? Role.PROFESSOR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload = { name, email, initials: initials.toUpperCase(), role };
      if (faculty) await apiClient.patch(`/api/faculty/${faculty.id}`, payload);
      else await apiClient.post('/api/faculty', payload);
      onSuccess();
    } catch (err: unknown) {
      setError((err as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h2 style={{fontSize:20,fontWeight:800}}>{faculty ? 'Edit Faculty' : 'Add Faculty'}</h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'var(--muted)'}}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',flex:1}}>
          <div className="drawer-body">
            <div className="field-group">
              <label className="field-label">Full Name</label>
              <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Dr. First Last" required />
            </div>
            <div className="field-group">
              <label className="field-label">Email Address</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="faculty@institution.edu" required />
            </div>
            <div className="grid-2">
              <div className="field-group">
                <label className="field-label">Initials</label>
                <input className="input" value={initials} onChange={e=>setInitials(e.target.value.toUpperCase())} placeholder="e.g. VKB" required maxLength={6} />
                <span className="input-hint">Used in timetable cell references</span>
              </div>
              <div className="field-group">
                <label className="field-label">Role</label>
                <select className="input" value={role} onChange={e=>setRole(e.target.value as Role)}>
                  {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {!faculty && (
              <div style={{background:'#eef5ff',borderRadius:10,padding:'10px 14px',fontSize:13,color:'var(--brand-deep)',fontWeight:600}}>
                Default password: <code>Samayak@2024</code> — user should change on first login.
              </div>
            )}
            {error && <div style={{background:'#fdecee',borderRadius:10,padding:'10px 14px',fontSize:13,color:'var(--error)',fontWeight:600}}>{error}</div>}
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
