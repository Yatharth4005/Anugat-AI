'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/apiClient';
import type { Course, Department, Branch, PaginatedResponse } from '@samayak/types';
import { CourseType } from '@samayak/types';
import { useToast } from '@/components/ToastContext';
import ImportWizard from '@/components/ImportWizard';

const COURSE_TYPE_LABELS: Record<CourseType, string> = { LECTURE: 'Lecture', LAB: 'Lab', TUTORIAL: 'Tutorial' };

async function fetchCourses(page: number, search: string, branchId: string, deptId: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: '20', search });
  if (branchId) params.set('branchId', branchId);
  if (deptId) params.set('departmentId', deptId);
  const res = await apiClient.get<PaginatedResponse<Course> & { success: boolean }>(`/api/courses?${params}`);
  return res.data;
}

export default function CoursesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const { data: depts } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { data: Department[] } }>('/api/departments?pageSize=100');
      return (res.data as unknown as { data: Department[] }).data;
    },
  });

  const { data: branches } = useQuery({
    queryKey: ['branches', filterDept],
    queryFn: async () => {
      if (!filterDept) return [];
      const res = await apiClient.get<{ data: Department & { branches: Branch[] } }>(`/api/departments/${filterDept}`);
      return res.data.data.branches ?? [];
    },
    enabled: !!filterDept,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['courses', page, search, filterBranch, filterDept],
    queryFn: () => fetchCourses(page, search, filterBranch, filterDept),
    placeholderData: (prev) => prev,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/courses/${id}`),
    onSuccess: () => { 
      toast('Course archived', 'success'); 
      qc.invalidateQueries({ queryKey: ['courses'] }); 
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const activeDeptObj = depts?.find(d => d.id === filterDept);
  const activeBranchObj = branches?.find(b => b.id === filterBranch);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses</h1>
          {filterDept || filterBranch ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span className="badge badge-blue" style={{ fontSize: 13, fontWeight: 700, padding: '5px 10px' }}>
                Editing Scope: {activeDeptObj?.name} {activeBranchObj ? `(Sem ${activeBranchObj.semester} - Sec ${activeBranchObj.section})` : ''}
              </span>
            </div>
          ) : (
            <p className="page-subtitle">Manage courses scoped by branch and semester</p>
          )}
        </div>
        <div className="page-actions">
          <button className="btn btn-white btn-sm" id="btn-import-courses" onClick={() => setShowImportModal(true)}>
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Import CSV
          </button>
          <button className="btn btn-primary btn-sm" id="btn-add-course" onClick={() => setShowDrawer(true)}>
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Course
          </button>
        </div>
      </div>

      {/* Scope Selector */}
      <div style={{ background: 'var(--canvas-2)', border: '1.5px solid var(--line-2)', borderRadius: 'var(--r-card)', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Scope Filter</div>
        <div className="filters-row">
          <div className="search-bar">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Search by code or name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="input" value={filterDept} onChange={e => { setFilterDept(e.target.value); setFilterBranch(''); setPage(1); }}>
            <option value="">All Departments</option>
            {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {filterDept && (
            <select className="input" value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setPage(1); }}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {(filterDept || filterBranch || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterDept(''); setFilterBranch(''); setSearch(''); setPage(1); }}>Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Course Name</th>
              <th>Type</th>
              <th>Credits</th>
              <th>Branch</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({length:6}).map((_,i) => <tr key={i}>{Array.from({length:6}).map((_,j) => <td key={j}><div className="skeleton" style={{height:16}} /></td>)}</tr>)
            ) : !data?.data?.length ? (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-icon"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg></div>
                  <div className="empty-title">No courses found</div>
                  <div className="empty-sub">Try adjusting filters or add a course</div>
                </div>
              </td></tr>
            ) : (
              data.data.map((course) => {
                const typedCourse = course as Course & { branch?: { name: string; semester: number } };
                return (
                  <tr key={course.id}>
                    <td><span style={{fontWeight:800, fontFamily:'ui-monospace,monospace', fontSize:13}}>{course.code}</span></td>
                    <td>
                      <div style={{fontWeight:600}}>{course.name}</div>
                    </td>
                    <td><span className={`badge course-${course.type}`}>{COURSE_TYPE_LABELS[course.type]}</span></td>
                    <td>
                      {course.credits === 0 ? (
                        <span className="badge badge-orange" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          ⚠️ 0 Credits
                        </span>
                      ) : (
                        <span style={{fontWeight:700}}>{course.credits} cr</span>
                      )}
                    </td>
                    <td>
                      <div style={{fontSize:13}}>{typedCourse.branch?.name ?? '—'}</div>
                      {typedCourse.branch?.semester && <div style={{fontSize:12,color:'var(--muted)'}}>Sem {typedCourse.branch.semester}</div>}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingCourse(course); setShowDrawer(true); }}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => archiveMutation.mutate(course.id)}>Archive</button>
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
              <button className="page-btn" disabled={page<=1} onClick={() => setPage(p=>p-1)}>‹</button>
              {Array.from({length:Math.min(5,data.totalPages)},(_,i)=>i+1).map(p => (
                <button key={p} className={`page-btn ${p===page?'active':''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={page>=data.totalPages} onClick={() => setPage(p=>p+1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {showDrawer && (
        <CourseDrawer
          course={editingCourse}
          depts={depts ?? []}
          onClose={() => { setShowDrawer(false); setEditingCourse(null); }}
          onSuccess={() => { 
            qc.invalidateQueries({queryKey:['courses']}); 
            qc.invalidateQueries({queryKey:['analytics']});
            toast(editingCourse ? 'Course updated' : 'Course added', 'success'); 
            setShowDrawer(false); 
            setEditingCourse(null); 
          }}
        />
      )}

      {showImportModal && (
        <ImportWizard
          title="Import Courses"
          importEndpoint="/api/courses/import"
          sampleColumns={['Course Code', 'Course Name', 'Credits', 'Type', 'Department Short Code', 'Semester', 'Section']}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['courses'] });
            qc.invalidateQueries({ queryKey: ['analytics'] });
            toast('Courses imported successfully', 'success');
          }}
        />
      )}
    </div>
  );
}

function CourseDrawer({ course, depts, onClose, onSuccess }: { course: Course | null; depts: Department[]; onClose: () => void; onSuccess: () => void }) {
  const [code, setCode] = useState(course?.code ?? '');
  const [name, setName] = useState(course?.name ?? '');
  const [credits, setCredits] = useState(course?.credits?.toString() ?? '3');
  const [type, setType] = useState<CourseType>(course?.type ?? CourseType.LECTURE);
  const [deptId, setDeptId] = useState(depts[0]?.id ?? '');
  const [branchId, setBranchId] = useState(course?.branchId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: branches } = useQuery({
    queryKey: ['branches-for-drawer', deptId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Department & { branches: Branch[] } }>(`/api/departments/${deptId}`);
      return res.data.data.branches ?? [];
    },
    enabled: !!deptId,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload = { code: code.toUpperCase(), name, credits: Number(credits), type, branchId };
      if (course) await apiClient.patch(`/api/courses/${course.id}`, payload);
      else await apiClient.post('/api/courses', payload);
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
          <h2 style={{fontSize:20,fontWeight:800}}>{course ? 'Edit Course' : 'Add Course'}</h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'var(--muted)'}}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',flex:1}}>
          <div className="drawer-body">
            <div className="field-group">
              <label className="field-label">Course Code</label>
              <input className="input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. CS201" required />
            </div>
            <div className="field-group">
              <label className="field-label">Course Name</label>
              <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Data Structures" required />
            </div>
            <div className="grid-2">
              <div className="field-group">
                <label className="field-label">Credits</label>
                <input className="input" type="number" value={credits} onChange={e=>setCredits(e.target.value)} min={0} max={20} step={0.5} required />
              </div>
              <div className="field-group">
                <label className="field-label">Type</label>
                <select className="input" value={type} onChange={e=>setType(e.target.value as CourseType)}>
                  {Object.entries(COURSE_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Department</label>
              <select className="input" value={deptId} onChange={e=>setDeptId(e.target.value)} required>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Branch / Section</label>
              <select className="input" value={branchId} onChange={e=>setBranchId(e.target.value)} required>
                <option value="">Select branch...</option>
                {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {error && <div style={{background:'#fdecee',borderRadius:10,padding:'10px 14px',fontSize:13,color:'var(--error)',fontWeight:600}}>{error}</div>}
          </div>
          <div className="drawer-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {course ? 'Save Changes' : 'Add Course'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
