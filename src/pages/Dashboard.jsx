import { LayoutDashboard, ArrowRight } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';

export default function Dashboard() {
  const { setActivePage } = useAppStore();
  const { activeWorkspace } = useWorkspace();

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
            <LayoutDashboard size={28} className="text-accent/50" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">No widgets yet</h2>
          <p className="text-sm text-content-muted mb-6 leading-relaxed">
            Add your first data source in Settings to get started. Once connected, your dashboard will populate with
            activation metrics and member insights.
          </p>
          <button
            onClick={() => setActivePage('settings')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Settings
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content-primary">Dashboard</h1>
        <p className="text-sm text-content-muted mt-1">
          Workspace: {activeWorkspace.name}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="aspect-[4/3] rounded-lg border border-dashed border-border-primary bg-surface-secondary flex items-center justify-center"
          >
            <p className="text-xs text-content-muted">Widget slot {i}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-content-muted mt-4 text-center">
        Charts and metrics coming in Phase 2
      </p>
    </div>
  );
}
