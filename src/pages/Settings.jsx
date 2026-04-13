import { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Trash2, Check, FolderOpen, Upload, Loader2, RotateCcw, Save, RefreshCw, FileText, X, MoreHorizontal, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { api } from '../utils/api.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

const SEGMENT_COLORS = {
  ghost: '#EF4444',
  one_and_done: '#F97316',
  approaching_threshold: '#EAB308',
  in_the_zone: '#22C55E',
  power_user: '#3B82F6',
  new_member: '#8B5CF6',
};

const SEGMENT_LABELS = {
  ghost: 'Ghost',
  one_and_done: 'One & Done',
  approaching_threshold: 'Approaching',
  in_the_zone: 'In the Zone',
  power_user: 'Power User',
};

const DEFAULT_THRESHOLDS = {
  ghost: { maxVisits: 1, minDaysSincePurchase: 60 },
  one_and_done: { maxVisits: 2, minDaysSinceLastVisit: 30 },
  approaching_threshold: { minVisits: 3, maxVisits: 7 },
  in_the_zone: { minVisits: 8, maxVisits: 15 },
  power_user: { minVisits: 16 },
};

const THRESHOLD_FIELDS = {
  ghost: [
    { key: 'maxVisits', label: 'Max Visits' },
    { key: 'minDaysSincePurchase', label: 'Min Days Since Purchase' },
  ],
  one_and_done: [
    { key: 'maxVisits', label: 'Max Visits' },
    { key: 'minDaysSinceLastVisit', label: 'Min Days Since Last Visit' },
  ],
  approaching_threshold: [
    { key: 'minVisits', label: 'Min Visits' },
    { key: 'maxVisits', label: 'Max Visits' },
  ],
  in_the_zone: [
    { key: 'minVisits', label: 'Min Visits' },
    { key: 'maxVisits', label: 'Max Visits' },
  ],
  power_user: [
    { key: 'minVisits', label: 'Min Visits' },
  ],
};

export default function Settings() {
  const { theme } = useAppStore();
  const { workspaces, activeWorkspace, activeWorkspaceId, createWorkspace, updateWorkspace, reimportWorkspace, deleteWorkspace, switchWorkspace, loadWorkspaces } = useWorkspace();

  const [wsMenuId, setWsMenuId] = useState(null);
  const [wsExpandedId, setWsExpandedId] = useState(null);
  const [wsEditId, setWsEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFiles, setEditFiles] = useState([]);
  const [editUploadedFiles, setEditUploadedFiles] = useState([]);
  const [editSelectedFiles, setEditSelectedFiles] = useState([]);
  const [editImporting, setEditImporting] = useState(false);
  const [editError, setEditError] = useState(null);
  const editFileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [newName, setNewName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  // Drag-and-drop upload state
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]); // { file, name, size, detectedType, headers, rowCount }

  // Inline mapping state (import flow)
  const [showMapping, setShowMapping] = useState(false);
  const [mappingEntries, setMappingEntries] = useState([]);
  const [canonicalFields, setCanonicalFields] = useState([]);

  // Column mapping state (existing workspace read-only view)
  const [mappingFields, setMappingFields] = useState([]);
  const [columnMapping, setColumnMapping] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState(null);
  const [mappingSuccess, setMappingSuccess] = useState(null);
  const [editingMapping, setEditingMapping] = useState(false);

  // Threshold state
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [thresholdsSaving, setThresholdsSaving] = useState(false);
  const [thresholdsError, setThresholdsError] = useState(null);
  const [thresholdsSuccess, setThresholdsSuccess] = useState(null);

  const loadFiles = useCallback(async () => {
    try {
      const data = await api.get('/files');
      setFiles(data);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  }, []);

  const loadMappingFields = useCallback(async () => {
    try {
      const data = await api.get('/mapping/fields');
      setMappingFields(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load mapping fields:', err);
    }
  }, []);

  const loadColumnMapping = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setMappingLoading(true);
    setMappingError(null);
    try {
      const data = await api.get(`/mapping?workspace=${activeWorkspaceId}`);
      if (Array.isArray(data) && data.length > 0) {
        setColumnMapping(data);
      } else if (data && typeof data === 'object' && data.mapping) {
        setColumnMapping(Array.isArray(data.mapping) ? data.mapping : []);
      } else {
        setColumnMapping([]);
      }
    } catch (err) {
      console.error('Failed to load column mapping:', err);
      setColumnMapping([]);
    } finally {
      setMappingLoading(false);
    }
  }, [activeWorkspaceId]);

  const loadThresholds = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const ws = await api.get(`/workspaces/${activeWorkspaceId}`);
      if (ws && ws.thresholds) {
        setThresholds({ ...DEFAULT_THRESHOLDS, ...ws.thresholds });
      } else {
        setThresholds(DEFAULT_THRESHOLDS);
      }
    } catch (err) {
      console.error('Failed to load thresholds:', err);
      setThresholds(DEFAULT_THRESHOLDS);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadFiles();
    loadMappingFields();
  }, [loadFiles, loadMappingFields]);

  useEffect(() => {
    loadColumnMapping();
    loadThresholds();
  }, [loadColumnMapping, loadThresholds]);

  function toggleFile(file) {
    setSelectedFiles((prev) => (prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]));
  }

  function detectFileType(headers) {
    const h = headers.map(s => s.toLowerCase());
    if (h.some(x => x.includes('visit_id') || x.includes('visit_date')) && h.some(x => x.includes('venue'))) return 'Visit history';
    if (h.some(x => x.includes('venue_id')) && h.some(x => x.includes('popularity'))) return 'Venue reference';
    if (h.some(x => x.includes('snapshot_date'))) return 'Historical snapshots';
    if (h.some(x => x.includes('member_id') || x.includes('purchase') || x.includes('visit'))) return 'Member data';
    return 'Data file';
  }

  function handleFileDrop(fileList) {
    if (!fileList || fileList.length === 0) return;
    const newFiles = Array.from(fileList);
    const promises = newFiles.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target.result;
          const lines = text.split('\n').filter(l => l.trim());
          const headers = lines.length > 0 ? lines[0].split(/[,\t]/).map(h => h.trim().replace(/^["']|["']$/g, '')) : [];
          const rowCount = Math.max(0, lines.length - 1);
          const detectedType = detectFileType(headers);
          resolve({ file, name: file.name, size: file.size, detectedType, headers, rowCount });
        };
        reader.readAsText(file);
      });
    });
    Promise.all(promises).then((parsed) => {
      setUploadedFiles((prev) => [...prev, ...parsed]);
    });
  }

  function removeFile(index) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadFiles(fileList) {
    const formData = new FormData();
    for (const f of fileList) {
      formData.append('files', f.file);
    }
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  async function handleImport() {
    if (!newName.trim()) return;
    // If we have uploaded files, use the new upload flow
    if (uploadedFiles.length > 0) {
      setImporting(true);
      setError(null);
      try {
        // Step 1: Upload files to server
        const uploadResult = await uploadFiles(uploadedFiles);

        // Step 2: Auto-map columns from the first file with member-like headers
        const memberFile = uploadedFiles.find(f => f.detectedType === 'Member data') || uploadedFiles[0];
        let fields = [];
        try {
          const fieldsResult = await api.get('/mapping/fields');
          fields = Array.isArray(fieldsResult) ? fieldsResult : Object.keys(fieldsResult || {});
        } catch (e) {
          // Fallback: use canonical field names directly
          fields = ['member_id','first_name','last_name','email','market','zip_code','purchase_date','renewal_date','acquisition_channel','total_visits','last_visit_date','plan_tier','plan_price','venue_name','venue_type','visit_date'];
        }
        setCanonicalFields(fields);

        const autoMapResult = await api.post('/mapping/auto', { headers: memberFile.headers });
        // autoMapResult.mapping is an object { canonical_field: csv_column }
        // Convert to a reverse lookup: { csv_column: canonical_field }
        const mappingObj = autoMapResult?.mapping || {};
        const reverseLookup = {};
        for (const [canonical, csvCol] of Object.entries(mappingObj)) {
          reverseLookup[csvCol] = canonical;
        }

        // Build mapping entries with auto-match info
        const mapped = memberFile.headers.map((col) => {
          const canonicalMatch = reverseLookup[col] || null;
          return {
            csvColumn: col,
            canonicalField: canonicalMatch || 'skip',
            autoMatched: !!canonicalMatch,
          };
        });
        setMappingEntries(mapped);
        setShowMapping(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setImporting(false);
      }
      return;
    }
    // Fallback: use selected files from data/ directory
    if (selectedFiles.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      await createWorkspace(newName.trim(), selectedFiles);
      setNewName('');
      setSelectedFiles([]);
      loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function updateMapping(csvColumn, canonicalField) {
    setMappingEntries((prev) =>
      prev.map((entry) =>
        entry.csvColumn === csvColumn ? { ...entry, canonicalField, autoMatched: false } : entry
      )
    );
  }

  async function confirmImport() {
    setImporting(true);
    setError(null);
    try {
      const mapping = mappingEntries.reduce((acc, entry) => {
        if (entry.canonicalField !== 'skip') {
          acc[entry.csvColumn] = entry.canonicalField;
        }
        return acc;
      }, {});
      const fileNames = uploadedFiles.map(f => f.name);
      await api.post('/workspaces', {
        name: newName.trim(),
        files: fileNames,
        mapping,
      });
      // Reset state
      setNewName('');
      setUploadedFiles([]);
      setShowMapping(false);
      setMappingEntries([]);
      loadFiles();
      await loadWorkspaces();
      const totalRows = uploadedFiles.reduce((sum, f) => sum + (f.rowCount || 0), 0);
      useAppStore.getState().showToast(`Imported ${totalRows} rows into "${newName.trim()}". Segmentation complete.`);
      useAppStore.getState().setActivePage('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const allAutoMatched = mappingEntries.length > 0 && mappingEntries.every(e => e.autoMatched || e.canonicalField === 'skip');

  function openEdit(ws) {
    setWsEditId(ws.id);
    setEditName(ws.name);
    setEditFiles(ws.dataSource?.files || []);
    setEditUploadedFiles([]);
    setEditSelectedFiles([]);
    setEditError(null);
    setWsExpandedId(null);
    setWsMenuId(null);
  }

  function closeEdit() {
    setWsEditId(null);
    setEditName('');
    setEditFiles([]);
    setEditUploadedFiles([]);
    setEditSelectedFiles([]);
    setEditError(null);
  }

  function handleEditFileDrop(fileList) {
    if (!fileList || fileList.length === 0) return;
    const newFiles = Array.from(fileList);
    const promises = newFiles.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines.length > 0 ? lines[0].split(/[,\t]/).map(h => h.trim().replace(/^["']|["']$/g, '')) : [];
        resolve({ file, name: file.name, size: file.size, headers, rowCount: Math.max(0, lines.length - 1) });
      };
      reader.readAsText(file);
    }));
    Promise.all(promises).then((parsed) => setEditUploadedFiles((prev) => [...prev, ...parsed]));
  }

  function toggleEditSelectedFile(filename) {
    setEditSelectedFiles((prev) => prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename]);
  }

  async function handleEditSave(ws) {
    const filesUnchanged =
      editUploadedFiles.length === 0 &&
      editSelectedFiles.length === 0 &&
      JSON.stringify([...editFiles].sort()) === JSON.stringify([...(ws.dataSource?.files || [])].sort());

    setEditImporting(true);
    setEditError(null);
    try {
      if (filesUnchanged) {
        await updateWorkspace(ws.id, { name: editName.trim() });
      } else {
        let allFileNames = [...editFiles, ...editSelectedFiles];
        if (editUploadedFiles.length > 0) {
          const formData = new FormData();
          for (const f of editUploadedFiles) formData.append('files', f.file);
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (!res.ok) throw new Error('Upload failed');
          const uploadResult = await res.json();
          allFileNames = [...allFileNames, ...uploadResult.files.map(f => f.filename)];
        }
        if (allFileNames.length === 0) {
          throw new Error('At least one file is required');
        }
        await reimportWorkspace(ws.id, editName.trim(), allFileNames);
        useAppStore.getState().showToast(`"${editName.trim()}" updated and re-imported successfully.`);
      }
      closeEdit();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditImporting(false);
    }
  }

  function handleMappingChange(csvColumn, canonicalField) {
    setColumnMapping((prev) =>
      prev.map((entry) =>
        entry.csv_column === csvColumn ? { ...entry, canonical_field: canonicalField } : entry
      )
    );
    setMappingSuccess(null);
  }

  async function handleAutoMap() {
    if (!activeWorkspaceId) return;
    setMappingLoading(true);
    setMappingError(null);
    setMappingSuccess(null);
    try {
      const headers = columnMapping.map((entry) => entry.csv_column);
      const data = await api.post('/mapping/auto', { headers, workspace: activeWorkspaceId });
      if (Array.isArray(data)) {
        setColumnMapping(data);
      } else if (data && data.mapping) {
        setColumnMapping(Array.isArray(data.mapping) ? data.mapping : []);
      }
      setMappingSuccess('Auto-mapping applied');
    } catch (err) {
      setMappingError(err.message);
    } finally {
      setMappingLoading(false);
    }
  }

  async function handleSaveMapping() {
    if (!activeWorkspaceId) return;
    setMappingSaving(true);
    setMappingError(null);
    setMappingSuccess(null);
    try {
      await api.put(`/mapping?workspace=${activeWorkspaceId}`, { mapping: columnMapping });
      // Re-run segmentation after saving mapping
      await api.post(`/data/segment?workspace=${activeWorkspaceId}`);
      setMappingSuccess('Mapping saved and segmentation updated');
    } catch (err) {
      setMappingError(err.message);
    } finally {
      setMappingSaving(false);
    }
  }

  function handleThresholdChange(segment, field, value) {
    const numValue = value === '' ? '' : Number(value);
    setThresholds((prev) => ({
      ...prev,
      [segment]: { ...prev[segment], [field]: numValue },
    }));
    setThresholdsSuccess(null);
  }

  function handleResetThresholds() {
    setThresholds(DEFAULT_THRESHOLDS);
    setThresholdsSuccess(null);
  }

  async function handleSaveThresholds() {
    if (!activeWorkspaceId) return;
    setThresholdsSaving(true);
    setThresholdsError(null);
    setThresholdsSuccess(null);
    try {
      await api.put(`/workspaces/${activeWorkspaceId}`, { thresholds });
      await api.post(`/data/segment?workspace=${activeWorkspaceId}`);
      setThresholdsSuccess('Thresholds saved and segmentation updated');
    } catch (err) {
      setThresholdsError(err.message);
    } finally {
      setThresholdsSaving(false);
    }
  }

  const requiredFields = ['member_id', 'total_visits'];

  return (
    <div className="overflow-y-auto h-full">
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-content-primary mb-6">Settings</h1>

      {/* Data Sources */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wider">Data Sources</h2>

        {workspaces.length > 0 ? (
          <div className="space-y-2 mb-5">
            {workspaces.map((ws) => (
              <div key={ws.id} className="rounded-lg bg-surface-secondary border border-border-subtle">
                {/* Main row */}
                <div className="flex items-center gap-3 p-3.5">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Database size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{ws.name}</p>
                    <p className="text-xs text-content-muted">
                      {ws.dataSource?.files?.length || 0} file(s)
                      {ws.dataSource?.lastImported && (
                        <> &middot; Imported {new Date(ws.dataSource.lastImported).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  {activeWorkspace?.id === ws.id ? (
                    <span className="flex items-center gap-1 text-xs text-accent font-medium">
                      <Check size={13} /> Active
                    </span>
                  ) : (
                    <button
                      onClick={() => switchWorkspace(ws.id)}
                      className="text-xs text-content-muted hover:text-accent font-medium transition-colors"
                    >
                      Switch to
                    </button>
                  )}
                  {/* 3-dot menu */}
                  <div className="relative">
                    <button
                      onClick={() => setWsMenuId(wsMenuId === ws.id ? null : ws.id)}
                      className="p-1.5 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {wsMenuId === ws.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setWsMenuId(null)} />
                        <div className="absolute right-0 top-full mt-1 w-44 bg-surface-primary border border-border-subtle rounded-lg shadow-xl z-50 py-1">
                          <button
                            onClick={() => openEdit(ws)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-tertiary transition-colors"
                          >
                            <Pencil size={12} /> Edit details
                          </button>
                          <button
                            onClick={() => { setWsExpandedId(wsExpandedId === ws.id ? null : ws.id); setWsEditId(null); setWsMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-tertiary transition-colors"
                          >
                            <FileText size={12} /> View files
                          </button>
                          <div className="border-t border-border-subtle my-1" />
                          <button
                            onClick={() => { deleteWorkspace(ws.id); setWsMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                          >
                            <Trash2 size={12} /> Delete workspace
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Read-only detail panel */}
                {wsExpandedId === ws.id && (
                  <div className="border-t border-border-subtle p-3.5 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-content-secondary mb-1.5">Included Files</p>
                      {ws.dataSource?.files?.length > 0 ? (
                        <div className="space-y-1">
                          {ws.dataSource.files.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-tertiary">
                              <FileText size={12} className="text-content-muted shrink-0" />
                              <span className="text-xs text-content-primary truncate">{f}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-content-muted">No files recorded</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-content-secondary mb-0.5">Created</p>
                        <p className="text-xs text-content-muted">{ws.createdAt ? new Date(ws.createdAt).toLocaleString() : 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-content-secondary mb-0.5">Last Import</p>
                        <p className="text-xs text-content-muted">{ws.dataSource?.lastImported ? new Date(ws.dataSource.lastImported).toLocaleString() : 'Never'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-content-secondary mb-0.5">Database</p>
                        <p className="text-xs text-content-muted font-mono">{ws.dbFile || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-content-secondary mb-0.5">Members</p>
                        <p className="text-xs text-content-muted">{ws.importResult?.rowCount?.toLocaleString() || 'Unknown'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setWsExpandedId(null)}
                      className="flex items-center gap-1 text-xs text-content-muted hover:text-content-secondary transition-colors"
                    >
                      <ChevronUp size={12} /> Collapse
                    </button>
                  </div>
                )}

                {/* Edit panel */}
                {wsEditId === ws.id && (
                  <div className="border-t border-border-subtle p-3.5 space-y-3">
                    <p className="text-xs font-semibold text-content-primary">Edit Data Source</p>

                    {/* Name */}
                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-md bg-surface-tertiary border border-border-subtle text-sm text-content-primary outline-none focus:border-accent transition-colors"
                      />
                    </div>

                    {/* Current files */}
                    <div>
                      <p className="text-xs font-medium text-content-secondary mb-1.5">Source Files</p>
                      {editFiles.length > 0 ? (
                        <div className="space-y-1">
                          {editFiles.map((f) => (
                            <div key={f} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-tertiary">
                              <FileText size={12} className="text-content-muted shrink-0" />
                              <span className="text-xs text-content-primary truncate flex-1">{f}</span>
                              <button
                                onClick={() => setEditFiles((prev) => prev.filter((x) => x !== f))}
                                className="text-content-muted hover:text-[var(--danger)] transition-colors"
                                title="Remove file"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--warning)]">No files — add at least one below.</p>
                      )}
                    </div>

                    {/* Newly uploaded files */}
                    {editUploadedFiles.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-content-secondary mb-1">Files to add</p>
                        {editUploadedFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-accent/10 border border-accent/20">
                            <FileText size={12} className="text-accent shrink-0" />
                            <span className="text-xs text-content-primary truncate flex-1">{f.name}</span>
                            <span className="text-xs text-content-muted">{f.rowCount} rows</span>
                            <button
                              onClick={() => setEditUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="text-content-muted hover:text-[var(--danger)] transition-colors"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add more files */}
                    <div>
                      <p className="text-xs font-medium text-content-secondary mb-1.5">Add Files</p>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); handleEditFileDrop(e.dataTransfer.files); }}
                        onClick={() => editFileInputRef.current?.click()}
                        className="border border-dashed border-border-primary rounded-lg p-4 text-center cursor-pointer hover:border-accent/50 hover:bg-surface-tertiary transition-colors"
                      >
                        <Upload size={16} className="mx-auto mb-1 text-content-muted" />
                        <p className="text-xs text-content-muted">Drag & drop or click to upload CSV</p>
                        <input
                          ref={editFileInputRef}
                          type="file"
                          accept=".csv,.tsv,.txt"
                          multiple
                          className="hidden"
                          onChange={(e) => handleEditFileDrop(e.target.files)}
                        />
                      </div>

                      {/* Select from data/ directory */}
                      {files.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-content-muted cursor-pointer hover:text-content-secondary">
                            Or select from data/ directory
                          </summary>
                          <div className="mt-1.5 space-y-1 max-h-36 overflow-y-auto">
                            {files
                              .filter((f) => !editFiles.includes(f))
                              .map((f) => (
                                <button
                                  key={f}
                                  onClick={() => toggleEditSelectedFile(f)}
                                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors ${
                                    editSelectedFiles.includes(f)
                                      ? 'bg-accent/10 text-accent'
                                      : 'text-content-secondary hover:bg-surface-tertiary'
                                  }`}
                                >
                                  <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${editSelectedFiles.includes(f) ? 'bg-accent border-accent' : 'border-border-primary'}`}>
                                    {editSelectedFiles.includes(f) && <Check size={8} className="text-white" />}
                                  </div>
                                  <span className="truncate">{f}</span>
                                </button>
                              ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {editError && <p className="text-xs text-[var(--danger)]">{editError}</p>}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleEditSave(ws)}
                        disabled={editImporting || !editName.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {editImporting ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {editImporting ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={closeEdit}
                        disabled={editImporting}
                        className="px-3 py-1.5 text-xs text-content-muted hover:text-content-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-dashed border-border-primary bg-surface-secondary mb-5">
            <p className="text-sm text-content-muted text-center">No data sources connected yet</p>
          </div>
        )}

        {/* Add New */}
        <div className="p-4 rounded-lg bg-surface-secondary border border-border-subtle">
          <h3 className="text-sm font-medium text-content-primary mb-3">Add New Data Source</h3>

          <label className="block text-xs font-medium text-content-secondary mb-1.5">
            Name your workspace to save this data source
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Q1 2026 Member Data, March Export"
            className="w-full px-3 py-2 rounded-md bg-surface-tertiary border border-border-subtle text-sm text-content-primary placeholder:text-content-muted outline-none focus:border-accent transition-colors mb-3"
          />

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileDrop(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-accent bg-accent/5' : 'border-border-primary hover:border-accent/50 hover:bg-surface-tertiary'
            }`}
          >
            <Upload size={24} className="mx-auto mb-2 text-content-muted" />
            <p className="text-sm text-content-primary">Drag & drop CSV files here</p>
            <p className="text-xs text-content-muted mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              multiple
              className="hidden"
              onChange={(e) => handleFileDrop(e.target.files)}
            />
          </div>

          {/* Uploaded file list */}
          {uploadedFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-tertiary">
                  <FileText size={16} className="text-content-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-content-primary truncate">{f.name}</p>
                    <p className="text-xs text-content-muted">
                      {(f.size / 1024).toFixed(0)} KB · {f.rowCount} rows · {f.detectedType}
                    </p>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-content-muted hover:text-[var(--danger)]">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible data/ directory browser */}
          <details className="mt-3">
            <summary className="text-xs text-content-muted cursor-pointer hover:text-content-secondary">
              Or select from data/ directory ({files.length} files)
            </summary>
            <div className="mt-2 space-y-1">
              {files.length > 0 ? (
                files.map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleFile(f)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors ${
                      selectedFiles.includes(f)
                        ? 'bg-accent/10 text-accent'
                        : 'text-content-secondary hover:bg-surface-tertiary'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        selectedFiles.includes(f) ? 'bg-accent border-accent' : 'border-border-primary'
                      }`}
                    >
                      {selectedFiles.includes(f) && <Check size={10} className="text-white" />}
                    </div>
                    <span className="truncate">{f}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-content-muted px-3 py-2">
                  No files found. Place CSV files in the <code className="px-1 py-0.5 bg-surface-tertiary rounded text-xs">data/</code> directory.
                </p>
              )}
            </div>
          </details>

          {error && (
            <p className="text-xs text-[var(--danger)] mt-3">{error}</p>
          )}

          {!showMapping && (
            <div className="mt-3">
              {!newName.trim() && (uploadedFiles.length > 0 || selectedFiles.length > 0) && (
                <p className="text-xs text-[var(--warning)] mb-2">Enter a workspace name above to enable import.</p>
              )}
              {newName.trim() && uploadedFiles.length === 0 && selectedFiles.length === 0 && (
                <p className="text-xs text-content-muted mb-2">Select or drag files above to import.</p>
              )}
              <button
                onClick={handleImport}
                disabled={!newName.trim() || (uploadedFiles.length === 0 && selectedFiles.length === 0) || importing}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {importing ? 'Uploading...' : 'Import & Create Workspace'}
              </button>
            </div>
          )}

          {/* Inline column mapping */}
          {showMapping && (
            <div className="mt-4 p-4 rounded-lg bg-surface-secondary border border-border-subtle">
              <h4 className="text-sm font-medium text-content-primary mb-3">Column Mapping</h4>
              {allAutoMatched && (
                <p className="text-xs text-[#22C55E] mb-3">All columns were automatically matched.</p>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {mappingEntries.map((entry) => (
                  <div key={entry.csvColumn} className="flex items-center gap-3">
                    <span className="text-xs text-content-secondary w-32 truncate">{entry.csvColumn}</span>
                    <span className="text-content-muted">&#8594;</span>
                    <select
                      value={entry.canonicalField}
                      onChange={(e) => updateMapping(entry.csvColumn, e.target.value)}
                      className="flex-1 text-xs px-2 py-1.5 rounded bg-surface-tertiary border border-border-subtle text-content-primary"
                    >
                      <option value="skip">Skip this column</option>
                      {(canonicalFields.length > 0 ? canonicalFields : [
                        'member_id','first_name','last_name','email','market','zip_code',
                        'purchase_date','renewal_date','acquisition_channel','total_visits',
                        'last_visit_date','plan_tier','plan_price','venue_name','venue_type','visit_date'
                      ]).map(f => (
                        <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    {entry.autoMatched && <Check size={14} className="text-[#22C55E] shrink-0" />}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {importing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {importing ? 'Importing...' : 'Confirm & Import'}
                </button>
                <button
                  onClick={() => setShowMapping(false)}
                  className="px-4 py-2 text-sm font-medium text-content-muted hover:text-content-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Column Mapping */}
      {activeWorkspace && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wider">Column Mapping</h2>
          <div className="p-4 rounded-lg bg-surface-secondary border border-border-subtle">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-content-secondary">
                Column mapping for <span className="font-medium text-content-primary">{activeWorkspace.name}</span>
              </p>
              {!editingMapping && columnMapping.length > 0 && (
                <button
                  onClick={() => setEditingMapping(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {mappingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-content-muted" />
              </div>
            ) : columnMapping.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-content-muted">No column mapping available. Import data first to configure mapping.</p>
              </div>
            ) : !editingMapping ? (
              /* Read-only view */
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {columnMapping.filter(e => e.canonical_field && e.canonical_field !== 'skip').map((entry) => (
                  <div key={entry.csv_column} className="flex items-center gap-3 text-xs">
                    <span className="text-content-secondary w-32 truncate">{entry.csv_column}</span>
                    <span className="text-content-muted">&#8594;</span>
                    <span className="text-content-primary">{entry.canonical_field}</span>
                    <Check size={12} className="text-[#22C55E] shrink-0" />
                  </div>
                ))}
                {columnMapping.filter(e => !e.canonical_field || e.canonical_field === 'skip').length > 0 && (
                  <p className="text-xs text-content-muted mt-2">
                    {columnMapping.filter(e => !e.canonical_field || e.canonical_field === 'skip').length} column(s) skipped
                  </p>
                )}
              </div>
            ) : (
              /* Editable view */
              <>
                <div className="flex items-center justify-end mb-2">
                  <button
                    onClick={handleAutoMap}
                    disabled={mappingLoading || columnMapping.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent hover:text-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw size={12} />
                    Auto-Map
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
                  <div className="grid grid-cols-2 gap-3 px-1 pb-1">
                    <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">CSV Column</span>
                    <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">Maps To</span>
                  </div>
                  {columnMapping.map((entry) => {
                    const isMatched = entry.canonical_field && entry.canonical_field !== 'skip';
                    const isRequired = requiredFields.includes(entry.canonical_field);
                    return (
                      <div key={entry.csv_column} className="grid grid-cols-2 gap-3 items-center px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-content-primary truncate">{entry.csv_column}</span>
                          {isRequired && <span className="text-accent text-xs">*</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={entry.canonical_field || 'skip'}
                            onChange={(e) => handleMappingChange(entry.csv_column, e.target.value)}
                            className="flex-1 bg-surface-tertiary border border-border-subtle rounded px-2 py-1.5 text-sm text-content-primary outline-none focus:border-accent transition-colors"
                          >
                            <option value="skip">Skip this column</option>
                            {mappingFields.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                          {isMatched ? (
                            <Check size={14} className="text-[#22C55E] shrink-0" />
                          ) : (
                            <span className="text-xs text-[#F97316] shrink-0 whitespace-nowrap">Not mapped</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-content-muted mb-3">
                  Fields marked with <span className="text-accent">*</span> are required: {requiredFields.join(', ')}
                </p>

                {mappingError && (
                  <p className="text-xs text-[var(--danger)] mb-3">{mappingError}</p>
                )}
                {mappingSuccess && (
                  <p className="text-xs text-[#22C55E] mb-3">{mappingSuccess}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveMapping}
                    disabled={mappingSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {mappingSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {mappingSaving ? 'Saving...' : 'Save & Re-run Segmentation'}
                  </button>
                  <button
                    onClick={() => { setEditingMapping(false); loadColumnMapping(); }}
                    className="px-4 py-2 text-sm font-medium text-content-muted hover:text-content-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Segmentation Thresholds */}
      {activeWorkspace && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wider">Segmentation Thresholds</h2>
          <div className="p-4 rounded-lg bg-surface-secondary border border-border-subtle">
            <p className="text-sm text-content-secondary mb-4">
              Adjust how members are categorized into segments for <span className="font-medium text-content-primary">{activeWorkspace.name}</span>
            </p>

            <div className="space-y-4 mb-5">
              {Object.entries(THRESHOLD_FIELDS).map(([segment, fields]) => (
                <div key={segment} className="flex items-start gap-3">
                  <div className="flex items-center gap-2 w-36 pt-1.5 shrink-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: SEGMENT_COLORS[segment] }}
                    />
                    <span className="text-sm font-medium text-content-primary">
                      {SEGMENT_LABELS[segment]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {fields.map((field) => (
                      <div key={field.key} className="flex items-center gap-2">
                        <label className="text-xs text-content-muted whitespace-nowrap">{field.label}:</label>
                        <input
                          type="number"
                          min="0"
                          value={thresholds[segment]?.[field.key] ?? ''}
                          onChange={(e) => handleThresholdChange(segment, field.key, e.target.value)}
                          className="bg-surface-tertiary border border-border-subtle rounded px-2 py-1 w-20 text-sm text-content-primary outline-none focus:border-accent transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {thresholdsError && (
              <p className="text-xs text-[var(--danger)] mb-3">{thresholdsError}</p>
            )}
            {thresholdsSuccess && (
              <p className="text-xs text-green-500 mb-3">{thresholdsSuccess}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveThresholds}
                disabled={thresholdsSaving}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {thresholdsSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {thresholdsSaving ? 'Saving...' : 'Save & Re-run Segmentation'}
              </button>
              <button
                onClick={handleResetThresholds}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-content-muted hover:text-content-primary transition-colors"
              >
                <RotateCcw size={14} />
                Reset to Defaults
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wider">Appearance</h2>
        <div className="flex items-center gap-3 p-3.5 rounded-lg bg-surface-secondary border border-border-subtle">
          <div className="flex-1">
            <p className="text-sm font-medium text-content-primary">Theme</p>
            <p className="text-xs text-content-muted">Currently using {theme} mode</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wider">About</h2>
        <div className="p-3.5 rounded-lg bg-surface-secondary border border-border-subtle">
          <p className="text-sm font-medium text-content-primary">Beacon v4.0.0</p>
          <p className="text-xs text-content-muted mt-1 leading-relaxed">
            GetOut Activation Command Center. An internal analytics dashboard for monitoring member activation,
            identifying churn risk, and managing retention interventions.
          </p>
        </div>
      </section>
    </div>
    </div>
  );
}
