'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';
import apiClient from '@/lib/apiClient';
import type { ImportJob, ImportJobResult } from '@samayak/types';
import { ImportJobStatus } from '@samayak/types';
import { useToast } from '@/components/ToastContext';

const STEPS = [
  { key: 'QUEUED', label: 'Queued', icon: '⏳' },
  { key: 'PARSING', label: 'Parsing PDF', icon: '📄' },
  { key: 'INTEGRATING', label: 'Integrating Entities', icon: '🔗' },
  { key: 'DONE', label: 'Complete', icon: '✅' },
];

function getStepStatus(jobStatus: ImportJobStatus, stepKey: string): 'pending' | 'active' | 'done' | 'error' {
  const statusOrder = ['QUEUED', 'PARSING', 'INTEGRATING', 'DONE'];

  if (jobStatus === 'FAILED') {
    if (stepKey === 'DONE') return 'error';
    return 'done';
  }
  if (jobStatus === 'DONE') {
    return 'done';
  }

  const jobIdx = statusOrder.indexOf(jobStatus);
  const stepIdx = statusOrder.indexOf(stepKey);

  if (jobIdx > stepIdx) return 'done';
  if (jobIdx === stepIdx) return 'active';
  return 'pending';
}

export default function PdfIngestionPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleResetTimetable = async () => {
    if (!window.confirm('Are you sure you want to reset all timetable slots, courses, and imported entities to the default seed baseline? This cannot be undone.')) {
      return;
    }
    setResetting(true);
    try {
      await apiClient.delete('/api/timetable/reset');
      qc.invalidateQueries({ queryKey: ['import-jobs-list'] });
      qc.invalidateQueries({ queryKey: ['import-job'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      setActiveJobId(null);
      toast('Database reset to seed baseline successfully!', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.error ?? 'Reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  // Poll active job
  const { data: activeJob } = useQuery({
    queryKey: ['import-job', activeJobId],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: ImportJob }>(`/api/timetable/job/${activeJobId}`);
      return res.data.data;
    },
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job || job.status === 'DONE' || job.status === 'FAILED') return false;
      return 2000; // poll every 2s while running
    },
  });

  // When job completes, invalidate analytics
  if (activeJob?.status === 'DONE') {
    qc.invalidateQueries({ queryKey: ['analytics'] });
  }

  // Recent jobs list
  const { data: recentJobs } = useQuery({
    queryKey: ['import-jobs-list'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: ImportJob[] }>('/api/timetable/jobs');
      return res.data.data;
    },
    refetchInterval: activeJobId ? 5000 : false,
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const res = await apiClient.post<{ success: boolean; data: { jobId: string } }>(
        '/api/timetable/ingest',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const jobId = res.data.data.jobId;
      setActiveJobId(jobId);
      qc.invalidateQueries({ queryKey: ['import-jobs-list'] });
      toast('PDF uploaded and processing started!', 'success');
    } catch (err: unknown) {
      toast((err as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }, [qc, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled: uploading || (activeJob?.status !== 'DONE' && activeJob?.status !== 'FAILED' && !!activeJobId),
  });

  const result = activeJob?.result as ImportJobResult | null;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Timetable PDF Ingestion</h1>
          <p className="page-subtitle">Upload a department timetable PDF — the system parses, extracts, and integrates it automatically</p>
        </div>
        <button
          className="btn btn-danger btn-sm"
          onClick={handleResetTimetable}
          disabled={resetting}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {resetting ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Resetting...
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <polyline points="3 3 3 8 8 8" />
              </svg>
              Reset Timetable Data
            </>
          )}
        </button>
      </div>

      <div className="ingestion-grid">

        {/* ── Left: Upload + Progress ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Drop Zone */}
          <div className="card" style={{ padding: 24 }}>
            <div {...getRootProps()} className={`drop-zone ${isDragActive ? 'active' : ''}`}>
              <input {...getInputProps()} />
              <div className="drop-zone-icon">
                {uploading ? (
                  <div className="spinner" />
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                )}
              </div>
              <div className="drop-zone-title">
                {uploading ? 'Uploading...' : isDragActive ? 'Drop the PDF here' : 'Drop timetable PDF here'}
              </div>
              <div className="drop-zone-sub">
                or <span style={{ color: 'var(--brand-blue)', fontWeight: 700 }}>browse files</span> · PDF only · Max 50MB
              </div>
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
                Accepts BIT Mesra timetable format (any department)
              </div>
            </div>
          </div>

          {/* Live Progress */}
          {activeJob && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>Processing: {activeJob.fileName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    Job ID: <code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>{activeJob.id.slice(0, 16)}...</code>
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 22, color: activeJob.status === 'DONE' ? 'var(--success)' : activeJob.status === 'FAILED' ? 'var(--error)' : 'var(--brand-blue)' }}>
                  {activeJob.progress}%
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 8, background: 'var(--line-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{
                  height: '100%',
                  width: `${activeJob.progress}%`,
                  background: activeJob.status === 'FAILED' ? 'var(--error)' : 'var(--gradient)',
                  borderRadius: 999,
                  transition: 'width 0.5s ease',
                }} />
              </div>

              {/* Steps */}
              <div className="progress-steps">
                {STEPS.map((step) => {
                  const status = getStepStatus(activeJob.status, step.key);
                  return (
                    <div key={step.key} className={`progress-step ${status}`}>
                      <div className={`step-icon ${status}`}>
                        {status === 'done' ? '✓' : status === 'error' ? '✕' : status === 'active' ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : '○'}
                      </div>
                      <div className={`step-label ${status}`}>{step.icon} {step.label}</div>
                      {status === 'active' && (
                        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--brand-blue)', fontWeight: 700, animation: 'pulse 1.5s infinite' }}>
                          In progress...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Error */}
              {activeJob.status === 'FAILED' && activeJob.error && (
                <div style={{ marginTop: 16, background: '#fdecee', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, color: 'var(--error)', fontWeight: 600 }}>
                  <strong>Error:</strong> {activeJob.error}
                </div>
              )}

              {/* Success: Analytics Update Banner */}
              {activeJob.status === 'DONE' && (
                <div style={{ marginTop: 16, background: '#e9f7f1', border: '1.5px solid #b8e9d5', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, color: '#1c7a5c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ✓ Analytics dashboard has been automatically updated with the new data.
                  <Link href="/dashboard" style={{ color: 'var(--brand-deep)', textDecoration: 'underline', marginLeft: 'auto' }}>View Dashboard →</Link>
                </div>
              )}
            </div>
          )}

          {/* Import Summary */}
          {result && activeJob?.status === 'DONE' && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 16 }}>Import Summary</div>

              <div className="grid-2" style={{ marginBottom: 20, gap: 12 }}>
                <div style={{ background: '#e9f7f1', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1c7a5c', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>✓ Created</div>
                  {Object.entries(result.created).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, color: '#1c7a5c', marginBottom: 3 }}>
                      <span>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                      <span style={{ fontWeight: 800 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#eef5ff', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-deep)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>↔ Matched</div>
                  {Object.entries(result.matched).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, color: 'var(--brand-deep)', marginBottom: 3 }}>
                      <span>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                      <span style={{ fontWeight: 800 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Parse Failures */}
              {result.pending.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--warning)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 24 24" style={{width:16,height:16,stroke:'currentColor',fill:'none',strokeWidth:2}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                    {result.pending.length} cells could not be parsed
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.pending.map((f, i) => (
                      <div key={i} style={{ background: '#fff8e0', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                        <div style={{ fontWeight: 700, color: '#a07800' }}>{f.location}</div>
                        <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>{f.reason}</div>
                        {f.rawContent && <code style={{ fontSize: 11, color: 'var(--muted)' }}>{f.rawContent}</code>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <button className="btn btn-white btn-sm" onClick={() => setActiveJobId(null)}>
                  Upload Another PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Recent Jobs + Format Guide ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Format Guide */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, color: 'var(--ink)' }}>Expected Format</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
              <p style={{ marginBottom: 8 }}>The system accepts timetables in <strong>BIT Mesra format</strong>:</p>
              <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Section headers: <code>CS-VI-A</code>, <code>MCA-II</code></li>
                <li>Cell format: <code>CS201 (219) / VKB</code></li>
                <li>Days: Monday – Friday</li>
                <li>Periods: I through IX</li>
                <li>Course list page with L-T-P credits</li>
                <li>Faculty list page with initials</li>
              </ul>
            </div>
          </div>

          {/* Recent Jobs */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Recent Imports</div>
            {!recentJobs?.length ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>No imports yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentJobs.slice(0, 8).map((job) => (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line)', cursor: 'pointer', transition: 'all 0.15s', background: activeJobId === job.id ? 'var(--canvas-2)' : '#fff' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                        {job.fileName}
                      </div>
                      <span className={`badge ${job.status === 'DONE' ? 'badge-green' : job.status === 'FAILED' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: 10 }}>
                        {job.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                      {new Date(job.createdAt).toLocaleDateString()} · {job.progress}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
