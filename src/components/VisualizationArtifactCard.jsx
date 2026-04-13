import { useState } from 'react';
import { Plus, CheckCircle2, Loader2 } from 'lucide-react';
import WidgetSandbox from './WidgetSandbox.jsx';

export default function VisualizationArtifactCard({ artifact, onAdd }) {
  const [saving, setSaving] = useState(false);

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

      <div className="p-4">
        <WidgetSandbox code={artifact?.code} title="" />
      </div>
    </div>
  );
}
