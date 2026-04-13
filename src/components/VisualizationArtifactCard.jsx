import { useEffect, useRef, useState } from 'react';
import { Plus, CheckCircle2, Loader2, MoreVertical } from 'lucide-react';
import WidgetSandbox from './WidgetSandbox.jsx';

export default function VisualizationArtifactCard({ artifact, onAdd }) {
  const [saving, setSaving] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  async function handleAdd() {
    if (saving || artifact?.savedWidgetId) return;
    setSaving(true);
    try {
      await onAdd();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border border-accent/20 bg-accent/5 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-accent/15 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Build Preview
          </p>
          <h4 className="text-sm font-semibold text-content-primary mt-1">
            {artifact?.title || 'Playground Visualization'}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
              title="More options"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[130px] bg-surface-primary border border-border-subtle rounded-lg shadow-lg py-1">
                <button
                  onClick={() => {
                    setShowCode((prev) => !prev);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors"
                >
                  {showCode ? 'Hide Code' : 'View Code'}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={saving || Boolean(artifact?.savedWidgetId)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              artifact?.savedWidgetId
                ? 'bg-green-500/10 text-green-600 dark:text-green-400 cursor-default'
                : 'bg-accent text-white hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : artifact?.savedWidgetId ? <CheckCircle2 size={12} /> : <Plus size={12} />}
            {artifact?.savedWidgetId ? 'Added to Dashboard' : saving ? 'Saving...' : 'Add to Dashboard'}
          </button>
        </div>
      </div>

      <div className="p-4">
        <WidgetSandbox code={artifact?.code} title="" />
      </div>

      {showCode && (
        <div className="border-t border-accent/15 px-4 py-3">
          <pre className="text-xs text-content-secondary font-mono overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap bg-surface-tertiary rounded-lg p-3">
            {artifact?.code}
          </pre>
        </div>
      )}
    </div>
  );
}
