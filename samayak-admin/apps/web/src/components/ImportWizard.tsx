'use client';

import { useState, useRef } from 'react';
import apiClient from '@/lib/apiClient';

interface ImportError {
  row: number;
  error: string;
}

interface ImportResults {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: ImportError[];
}

interface ImportWizardProps {
  title: string;
  importEndpoint: string;
  onClose: () => void;
  onSuccess: () => void;
  sampleColumns: string[];
}

export default function ImportWizard({
  title,
  importEndpoint,
  onClose,
  onSuccess,
  sampleColumns,
}: ImportWizardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResults(null);
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post<{ success: boolean; data: ImportResults }>(
        importEndpoint,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setResults(res.data.data);
      if (res.data.data.created || res.data.data.updated) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Import failed. Please verify file format.');
    } finally {
      setUploading(false);
    }
  };

  const isDragActive = false; // Simple file input wrapper for layout cleanliness

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 640, width: '90%' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--muted)' }}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {!results ? (
            <>
              {/* Instructions */}
              <div style={{ marginBottom: 20, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: 10 }}>Upload an Excel (<code>.xlsx</code>, <code>.xls</code>) or CSV file containing the following column headers:</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {sampleColumns.map((col) => (
                    <code key={col} style={{ background: 'var(--canvas-2)', border: '1px solid var(--line)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                      {col}
                    </code>
                  ))}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Note: Header names are case-insensitive. Empty rows will be ignored.</p>
              </div>

              {/* Upload Drop Zone / Input */}
              <div 
                className="drop-zone" 
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', padding: '32px 20px', border: '2px dashed var(--line-2)', borderRadius: 12, textAlign: 'center', transition: 'all 0.15s', background: 'var(--canvas-2)' }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={{ display: 'none' }} 
                />
                
                <div className="drop-zone-icon" style={{ fontSize: 32, marginBottom: 12 }}>
                  {uploading ? <span className="spinner" style={{ width: 32, height: 32 }} /> : '📁'}
                </div>

                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
                  {file ? file.name : 'Click to select CSV/Excel file'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Max file size 10MB'}
                </div>
              </div>

              {error && (
                <div style={{ marginTop: 16, background: '#fdecee', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, color: 'var(--error)', fontWeight: 600 }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
            </>
          ) : (
            /* Results pass/fail report */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120, background: '#e9f7f1', border: '1.5px solid #b8e9d5', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1c7a5c', textTransform: 'uppercase', marginBottom: 4 }}>Created</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1c7a5c' }}>{results.created ?? 0}</div>
                </div>

                {results.updated !== undefined && (
                  <div style={{ flex: 1, minWidth: 120, background: '#eef5ff', border: '1.5px solid #cce0ff', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand-deep)', textTransform: 'uppercase', marginBottom: 4 }}>Updated</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-deep)' }}>{results.updated ?? 0}</div>
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 120, background: 'var(--canvas-2)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Skipped</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{results.skipped ?? 0}</div>
                </div>
              </div>

              {/* Detailed row validations / logs */}
              {results.errors && results.errors.length > 0 ? (
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--ink)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'var(--error)', fill: 'none', strokeWidth: 2 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Import Log: {results.errors.length} failed rows
                  </div>

                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ margin: 0, width: '100%' }}>
                      <thead style={{ background: 'var(--canvas-2)', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ width: 80, fontSize: 11.5, padding: '8px 12px' }}>Row</th>
                          <th style={{ fontSize: 11.5, padding: '8px 12px', textAlign: 'left' }}>Validation Failure Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.errors.map((err, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ fontWeight: 700, textAlign: 'center', padding: '8px 12px', fontSize: 13, color: 'var(--muted)' }}>{err.row}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--error)', fontWeight: 500, lineHeight: 1.4 }}>{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#e9f7f1', border: '1.5px solid #b8e9d5', borderRadius: 10, padding: '12px 16px', color: '#1c7a5c', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ✓ All rows in spreadsheet passed validation and imported successfully.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={uploading}>
            {results ? 'Close' : 'Cancel'}
          </button>
          {!results && (
            <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? <span className="spinner" style={{ marginRight: 6 }} /> : null}
              Start Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
