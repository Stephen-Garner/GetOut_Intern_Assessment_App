import { useState } from 'react';
import { Check, X, Pencil, Loader2 } from 'lucide-react';
import WidgetSandbox from './WidgetSandbox.jsx';

export default function WidgetPreview({ title, code, onAdd, onDiscard, onRevise }) {
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    await onAdd();
    setSaving(false);
  }

  return (
    <div className="mb-6 border-2 border-dashed border-accent/40 rounded-lg p-4 bg-accent/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded">
            Preview
          </span>
          <span className="text-sm font-medium text-content-primary">{title || 'Custom Widget'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Add to Dashboard
          </button>
          <button
            onClick={onRevise}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary border border-border-subtle rounded-md transition-colors"
          >
            <Pencil size={12} />
            Revise
          </button>
          <button
            onClick={onDiscard}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-[var(--danger)] border border-border-subtle rounded-md transition-colors"
          >
            <X size={12} />
            Discard
          </button>
        </div>
      </div>
      <WidgetSandbox code={code} title="" />
    </div>
  );
}
