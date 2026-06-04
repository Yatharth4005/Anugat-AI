'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { Room, Department, PaginatedResponse } from '@samayak/types';
import { RoomType } from '@samayak/types';
import { useToast } from '@/components/ToastContext';

async function fetchRooms(page: number, search: string, type?: string, deptId?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20', search });
  if (type) params.set('type', type);
  if (deptId) params.set('departmentId', deptId);
  const res = await apiClient.get<PaginatedResponse<Room> & { success: boolean }>(`/api/rooms?${params}`);
  return res.data;
}

async function fetchDepts() {
  const res = await apiClient.get<{ success: boolean; data: Department[] }>('/api/departments?pageSize=100');
  return (res.data as unknown as { data: Department[] }).data;
}

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  CLASSROOM: 'Classroom',
  LAB: 'Lab',
  OTHER: 'Other',
};

export default function RoomsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Room | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['rooms', page, search, filterType, filterDept],
    queryFn: () => fetchRooms(page, search, filterType, filterDept),
    placeholderData: (prev) => prev,
  });

  const { data: depts } = useQuery({ queryKey: ['departments-list'], queryFn: fetchDepts });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/rooms/${id}`),
    onSuccess: () => { toast('Room deleted', 'success'); qc.invalidateQueries({ queryKey: ['rooms'] }); qc.invalidateQueries({ queryKey: ['analytics'] }); setDeleteConfirm(null); },
    onError: (err: unknown) => { toast((err as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Delete failed', 'error'); },
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rooms</h1>
          <p className="page-subtitle">Lecture rooms, labs, and other spaces</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-white btn-sm" id="btn-import-rooms">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Import CSV
          </button>
          <button className="btn btn-primary btn-sm" id="btn-add-room" onClick={() => setShowDrawer(true)}>
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Room
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Search rooms..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input" style={{ width: 160 }} value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" style={{ width: 200 }} value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}>
          <option value="">All departments</option>
          {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Room Number</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Department</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({length:5}).map((_,j) => <td key={j}><div className="skeleton" style={{height:16}} /></td>)}</tr>
              ))
            ) : !data?.data?.length ? (
              <tr><td colSpan={5}>
                <div className="empty-state">
                  <div className="empty-icon"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="15" rx="2" /></svg></div>
                  <div className="empty-title">No rooms found</div>
                  <div className="empty-sub">Add rooms to track utilisation</div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowDrawer(true)}>Add Room</button>
                </div>
              </td></tr>
            ) : (
              data.data.map((room) => (
                <tr key={room.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{room.number}</div>
                  </td>
                  <td>
                    <span className={`badge type-${room.type}`}>{ROOM_TYPE_LABELS[room.type]}</span>
                  </td>
                  <td>
                    {room.capacity ? (
                      <span style={{ fontWeight: 600 }}>{room.capacity} seats</span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--warning)', fontWeight: 600, fontSize: 13 }}>
                        <svg viewBox="0 0 24 24" style={{width:14,height:14,stroke:'currentColor',fill:'none',strokeWidth:2}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        Capacity missing
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
                      {(room as Room & { department?: { name: string } }).department?.name ?? '—'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingRoom(room); setShowDrawer(true); }}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(room)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">Showing {((page-1)*20)+1}–{Math.min(page*20, data.total)} of {data.total}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page<=1} onClick={() => setPage(p=>p-1)}>‹</button>
              {Array.from({length: Math.min(5, data.totalPages)}, (_,i)=>i+1).map(p => (
                <button key={p} className={`page-btn ${p===page?'active':''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={page>=data.totalPages} onClick={() => setPage(p=>p+1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showDrawer && (
        <RoomDrawer room={editingRoom} depts={depts ?? []} onClose={() => { setShowDrawer(false); setEditingRoom(null); }}
          onSuccess={() => { qc.invalidateQueries({queryKey:['rooms']}); qc.invalidateQueries({queryKey:['analytics']}); toast(editingRoom ? 'Room updated' : 'Room added', 'success'); setShowDrawer(false); setEditingRoom(null); }} />
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-header">
              <div className="modal-title">Delete Room?</div>
              <button onClick={() => setDeleteConfirm(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--muted)'}}>×</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:14.5,color:'var(--ink-soft)',lineHeight:1.6}}>Delete room <strong>{deleteConfirm.number}</strong>? Timetable slots assigned to this room will be unassigned. Analytics will update immediately.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <span className="spinner" /> : null} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomDrawer({ room, depts, onClose, onSuccess }: { room: Room | null; depts: Department[]; onClose: () => void; onSuccess: () => void }) {
  const [number, setNumber] = useState(room?.number ?? '');
  const [type, setType] = useState<RoomType>(room?.type ?? RoomType.CLASSROOM);
  const [capacity, setCapacity] = useState(room?.capacity?.toString() ?? '');
  const [deptId, setDeptId] = useState(room?.departmentId ?? (depts[0]?.id ?? ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const payload = { number, type, capacity: capacity ? Number(capacity) : null, departmentId: deptId };
      if (room) await apiClient.patch(`/api/rooms/${room.id}`, payload);
      else await apiClient.post('/api/rooms', payload);
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
          <h2 style={{fontSize:20,fontWeight:800}}>{room ? 'Edit Room' : 'Add Room'}</h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'var(--muted)'}}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',flex:1}}>
          <div className="drawer-body">
            <div className="field-group">
              <label className="field-label">Room Number / Name</label>
              <input className="input" value={number} onChange={e=>setNumber(e.target.value)} placeholder="e.g. 219, Lab 1, OOPDP Lab" required />
            </div>
            <div className="field-group">
              <label className="field-label">Room Type</label>
              <select className="input" value={type} onChange={e=>setType(e.target.value as RoomType)}>
                {Object.entries(ROOM_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Seating Capacity</label>
              <input className="input" type="number" value={capacity} onChange={e=>setCapacity(e.target.value)} placeholder="e.g. 60 (leave empty if unknown)" min={1} />
              <span className="input-hint">Required for accurate utilisation calculations</span>
            </div>
            <div className="field-group">
              <label className="field-label">Department</label>
              <select className="input" value={deptId} onChange={e=>setDeptId(e.target.value)} required>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {error && <div style={{background:'#fdecee',borderRadius:10,padding:'10px 14px',fontSize:13,color:'var(--error)',fontWeight:600}}>{error}</div>}
          </div>
          <div className="drawer-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {room ? 'Save Changes' : 'Add Room'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
