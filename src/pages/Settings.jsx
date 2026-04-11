import { useState, useEffect, useCallback } from 'react';
import { Database, Trash2, Check, FolderOpen, Upload, Loader2 } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { api } from '../utils/api.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

export default function Settings() {
  const { theme } = useAppStore();
  const { workspaces, activeWorkspace, createWorkspace, deleteWorkspace, switchWorkspace } = useWorkspace();

  const [files, setFiles] = useState([]);
  const [newName, setNewName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const loadFiles = useCallback(async () => {
    try {
      const data = await api.get('/files');
      setFiles(data);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  function toggleFile(file) {
    setSelectedFiles((prev) => (prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]));
  }

  async function handleImport() {
    if (!newName.trim() || selectedFiles.length === 0) return;
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

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <h1 className="text-xl font-semibold text-content-primary mb-6">Settings</h1>

      {/* Data Sources */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-content-primary mb-3 uppercase tracking-wider">Data Sources</h2>

        {workspaces.length > 0 ? (
          <div className="space-y-2 mb-5">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="flex items-center gap-3 p-3.5 rounded-lg bg-surface-secondary border border-border-subtle"
              >
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
                <button
                  onClick={() => deleteWorkspace(ws.id)}
                  className="p-1.5 rounded-md text-content-muted hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                  title="Delete workspace"
                >
                  <Trash2 size={14} />
                </button>
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

          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Workspace name (e.g. Q1 2026 Member Data)"
            className="w-full px-3 py-2 rounded-md bg-surface-tertiary border border-border-subtle text-sm text-content-primary placeholder:text-content-muted outline-none focus:border-accent transition-colors mb-3"
          />

          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen size={14} className="text-content-muted" />
              <span className="text-xs font-medium text-content-secondary">Files in data/ directory</span>
            </div>
            {files.length > 0 ? (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((f) => (
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
                ))}
              </div>
            ) : (
              <p className="text-xs text-content-muted px-3 py-2">
                No files found. Place CSV files in the <code className="px-1 py-0.5 bg-surface-tertiary rounded text-xs">data/</code> directory.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-[var(--danger)] mb-3">{error}</p>
          )}

          <button
            onClick={handleImport}
            disabled={!newName.trim() || selectedFiles.length === 0 || importing}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {importing ? 'Importing...' : 'Import & Create Workspace'}
          </button>
        </div>
      </section>

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
          <p className="text-sm font-medium text-content-primary">Beacon v1.0.0</p>
          <p className="text-xs text-content-muted mt-1 leading-relaxed">
            GetOut Activation Command Center. An internal analytics dashboard for monitoring member activation,
            identifying churn risk, and managing retention interventions.
          </p>
        </div>
      </section>
    </div>
  );
}
