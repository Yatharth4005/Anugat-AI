'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { Department, Branch, PaginatedResponse } from '@samayak/types';
import { useToast } from '@/components/ToastContext';
import ImportWizard from '@/components/ImportWizard';

async function fetchDepartments(page: number, search: string) {
  const res = await apiClient.get<PaginatedResponse<Department> & { success: boolean }>(
    `/api/departments?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`
  );
  return res.data;
}

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Department | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedDeptForBranches, setSelectedDeptForBranches] = useState<Department | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['departments', page, search],
    queryFn: () => fetchDepartments(page, search),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/departments/${id}`);
    },
    onSuccess: () => {
      toast('Department deleted', 'success');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setDeleteConfirm(null);
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const respData = (err as { response?: { data?: any } })?.response?.data;
      if (status === 409 && respData?.details) {
        if (window.confirm(`Warning: This department has ${respData.details.branches} branches, ${respData.details.rooms} rooms, and ${respData.details.faculty} faculty members. Deleting it will permanently remove all associated courses and timetable slots. Do you want to force delete all related records?`)) {
          deleteMutationForce.mutate(deleteConfirm!.id);
        }
      } else {
        const msg = respData?.error ?? 'Delete failed';
        toast(msg, 'error');
      }
    },
  });

  const deleteMutationForce = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/departments/${id}?force=true`);
    },
    onSuccess: () => {
      toast('Department and all associated records deleted', 'success');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setDeleteConfirm(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Force delete failed';
      toast(msg, 'error');
    },
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">Manage academic departments and branches</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-white btn-sm" id="btn-import-departments" onClick={() => setShowImportModal(true)}>
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Import CSV
          </button>
          <button className="btn btn-primary btn-sm" id="btn-add-department" onClick={() => setShowAddDrawer(true)}>
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Department
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <div className="search-bar" style={{ maxWidth: 360 }}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Short Code</th>
              <th>Branches</th>
              <th>Rooms</th>
              <th>Faculty</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j}><div className="skeleton" style={{ height: 16, borderRadius: 6 }} /></td>
                  ))}
                </tr>
              ))
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></div>
                    <div className="empty-title">No departments yet</div>
                    <div className="empty-sub">Add your first department to get started</div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddDrawer(true)}>Add Department</button>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((dept) => (
                <tr key={dept.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{dept.name}</div>
                  </td>
                  <td>
                    <span className="badge badge-blue">{dept.shortCode}</span>
                  </td>
                  <td>
                    <button 
                      className="btn btn-ghost btn-sm" 
                      style={{ fontWeight: 700, color: 'var(--brand-deep)', background: 'var(--canvas-2)', padding: '4px 10px', borderRadius: 8 }}
                      onClick={() => setSelectedDeptForBranches(dept)}
                    >
                      {(dept as Department & { _count?: { branches: number } })._count?.branches ?? 0} branch(es)
                    </button>
                  </td>
                  <td style={{ fontWeight: 600 }}>{(dept as Department & { _count?: { rooms: number } })._count?.rooms ?? 0}</td>
                  <td style={{ fontWeight: 600 }}>{(dept as Department & { _count?: { faculty: number } })._count?.faculty ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingDept(dept)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(dept)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">
              Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.total)} of {data.total}
            </span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => i + 1).map((p) => (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Drawer */}
      {(showAddDrawer || editingDept) && (
        <DepartmentDrawer
          dept={editingDept}
          onClose={() => { setShowAddDrawer(false); setEditingDept(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['departments'] });
            toast(editingDept ? 'Department updated' : 'Department created', 'success');
            setShowAddDrawer(false);
            setEditingDept(null);
          }}
        />
      )}

      {/* Branch CRUD Manager Modal */}
      {selectedDeptForBranches && (
        <BranchManagerModal
          dept={selectedDeptForBranches}
          onClose={() => setSelectedDeptForBranches(null)}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportWizard
          title="Import Departments"
          importEndpoint="/api/departments/import"
          sampleColumns={['Name', 'Short Code']}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['departments'] });
            toast('Import finished', 'success');
          }}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Department?</div>
              <button onClick={() => setDeleteConfirm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                You are about to delete <strong>{deleteConfirm.name}</strong>. This will also remove all associated branches, courses, and timetable slots. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending || deleteMutationForce.isPending}>
                {(deleteMutation.isPending || deleteMutationForce.isPending) ? <span className="spinner" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DepartmentDrawer({ dept, onClose, onSuccess }: { dept: Department | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(dept?.name ?? '');
  const [shortCode, setShortCode] = useState(dept?.shortCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (dept) {
        await apiClient.patch(`/api/departments/${dept.id}`, { name, shortCode: shortCode.toUpperCase() });
      } else {
        await apiClient.post('/api/departments', { name, shortCode: shortCode.toUpperCase() });
      }
      onSuccess();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {dept ? 'Edit Department' : 'Add Department'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="drawer-body">
            <div className="field-group">
              <label className="field-label">Department Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Computer Science & Engineering" required />
            </div>
            <div className="field-group">
              <label className="field-label">Short Code</label>
              <input className="input" value={shortCode} onChange={(e) => setShortCode(e.target.value.toUpperCase())} placeholder="e.g. CSE" required maxLength={10} />
              <span className="input-hint">Unique 2–10 character code. Used in timetable references.</span>
            </div>
            {error && <div style={{ background: '#fdecee', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>{error}</div>}
          </div>
          <div className="drawer-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {dept ? 'Save Changes' : 'Create Department'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function BranchManagerModal({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [bName, setBName] = useState('');
  const [bSemester, setBSemester] = useState('1');
  const [bSection, setBSection] = useState('A');
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const { data: deptDetails, isLoading, refetch } = useQuery({
    queryKey: ['department-details', dept.id],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: Department & { branches: Branch[] } }>(
        `/api/departments/${dept.id}`
      );
      return res.data.data;
    },
  });

  const addBranchMutation = useMutation({
    mutationFn: async (payload: { name: string; semester: number; section: string }) => {
      return apiClient.post(`/api/departments/${dept.id}/branches`, payload);
    },
    onSuccess: () => {
      toast('Branch added successfully', 'success');
      setBName('');
      setBSemester('1');
      setBSection('A');
      refetch();
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: any) => {
      toast(err?.response?.data?.error ?? 'Failed to add branch', 'error');
    },
  });

  const updateBranchMutation = useMutation({
    mutationFn: async ({ branchId, payload }: { branchId: string; payload: { name: string; semester: number; section: string } }) => {
      return apiClient.patch(`/api/departments/${dept.id}/branches/${branchId}`, payload);
    },
    onSuccess: () => {
      toast('Branch updated successfully', 'success');
      setEditingBranch(null);
      setBName('');
      setBSemester('1');
      setBSection('A');
      refetch();
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: any) => {
      toast(err?.response?.data?.error ?? 'Failed to update branch', 'error');
    },
  });

  const deleteBranchMutation = useMutation({
    mutationFn: async ({ branchId, force }: { branchId: string; force?: boolean }) => {
      return apiClient.delete(`/api/departments/${dept.id}/branches/${branchId}${force ? '?force=true' : ''}`);
    },
    onSuccess: () => {
      toast('Branch deleted successfully', 'success');
      refetch();
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        const details = err.response.data.details;
        if (window.confirm(`Warning: This branch has ${details.courses} courses and ${details.timetableSlots} timetable slots depending on it. Deleting it will cascade delete all related timetable records. Do you want to force delete?`)) {
          deleteBranchMutation.mutate({ branchId: err.config.url.split('/').pop().split('?')[0], force: true });
        }
      } else {
        toast(err?.response?.data?.error ?? 'Failed to delete branch', 'error');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: bName, semester: Number(bSemester), section: bSection.toUpperCase() };
    if (editingBranch) {
      updateBranchMutation.mutate({ branchId: editingBranch.id, payload });
    } else {
      addBranchMutation.mutate(payload);
    }
  };

  const handleEditClick = (branch: Branch) => {
    setEditingBranch(branch);
    setBName(branch.name);
    setBSemester(branch.semester.toString());
    setBSection(branch.section);
  };

  const handleCancelEdit = () => {
    setEditingBranch(null);
    setBName('');
    setBSemester('1');
    setBSection('A');
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 90 }}>
      <div className="modal" style={{ maxWidth: 720, width: '90%' }}>
        <div className="modal-header">
          <div className="modal-title">Branches: {dept.name} ({dept.shortCode})</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--muted)' }}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Form */}
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
                {editingBranch ? 'Edit Branch' : 'Add Branch Manually'}
              </div>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field-group">
                  <label className="field-label">Branch Name</label>
                  <input className="input" value={bName} onChange={e => setBName(e.target.value)} placeholder="e.g. B.Tech CSE VI Sem - Sec A" required />
                </div>
                <div className="grid-2">
                  <div className="field-group">
                    <label className="field-label">Semester</label>
                    <input className="input" type="number" min={1} max={10} value={bSemester} onChange={e => setBSemester(e.target.value)} required />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Section / Code</label>
                    <input className="input" value={bSection} onChange={e => setBSection(e.target.value)} placeholder="e.g. A" required maxLength={10} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                    {addBranchMutation.isPending || updateBranchMutation.isPending ? <span className="spinner" /> : null}
                    {editingBranch ? 'Save Changes' : 'Add Branch'}
                  </button>
                  {editingBranch && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handleCancelEdit}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* List */}
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Existing Branches</div>
              {isLoading ? (
                <div className="skeleton" style={{ height: 120 }} />
              ) : !deptDetails?.branches?.length ? (
                <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>No branches defined yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
                  {deptDetails.branches.map((b) => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--canvas-2)', borderRadius: 10, border: '1px solid var(--line)' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Sem {b.semester} · Sec {b.section}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleEditClick(b)}>Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={() => deleteBranchMutation.mutate({ branchId: b.id })}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
