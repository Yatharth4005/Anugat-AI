'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { Department, PaginatedResponse } from '@samayak/types';
import { useToast } from '@/components/ToastContext';

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
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Delete failed';
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
          <button className="btn btn-white btn-sm" id="btn-import-departments" onClick={() => toast('Import departments via CSV file', 'info')}>
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
                  <td style={{ fontWeight: 600 }}>{(dept as Department & { _count?: { branches: number } })._count?.branches ?? 0}</td>
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
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <span className="spinner" /> : null}
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
