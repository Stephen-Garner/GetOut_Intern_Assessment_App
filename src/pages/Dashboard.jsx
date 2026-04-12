import { useState, useEffect } from 'react';
import { LayoutDashboard, ArrowRight, Star, Trash2, Code, Eye } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { api } from '../utils/api.js';
import WidgetSandbox from '../components/WidgetSandbox.jsx';
import WidgetPreview from '../components/WidgetPreview.jsx';
import SegmentOverview from '../widgets/core/SegmentOverview.jsx';
import ActivationFunnel from '../widgets/core/ActivationFunnel.jsx';
import HealthDistribution from '../widgets/core/HealthDistribution.jsx';
import SegmentMigration from '../widgets/core/SegmentMigration.jsx';
import MarketComparison from '../widgets/core/MarketComparison.jsx';
import ChannelBreakdown from '../widgets/core/ChannelBreakdown.jsx';
import ActivityTimeline from '../widgets/core/ActivityTimeline.jsx';

export default function Dashboard() {
  const { setActivePage } = useAppStore();
  const { activeWorkspace } = useWorkspace();
  const [customWidgets, setCustomWidgets] = useState([]);
  const [previewWidget, setPreviewWidget] = useState(null);
  const [showCode, setShowCode] = useState(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    api.get(`/widgets?workspace=${activeWorkspace.id}`)
      .then(setCustomWidgets)
      .catch(() => setCustomWidgets([]));
  }, [activeWorkspace]);

  useEffect(() => {
    function handleWidgetPreview(e) {
      setPreviewWidget(e.detail);
    }
    window.addEventListener('beacon-widget-preview', handleWidgetPreview);
    return () => window.removeEventListener('beacon-widget-preview', handleWidgetPreview);
  }, []);

  async function addWidget(widget) {
    const saved = await api.post(`/widgets?workspace=${activeWorkspace.id}`, widget);
    setCustomWidgets(prev => [...prev, saved]);
    setPreviewWidget(null);
  }

  async function deleteWidget(id) {
    await api.delete(`/widgets/${id}?workspace=${activeWorkspace.id}`);
    setCustomWidgets(prev => prev.filter(w => w.id !== id));
  }

  async function toggleStar(widget) {
    const updated = await api.put(`/widgets/${widget.id}?workspace=${activeWorkspace.id}`, { starred: !widget.starred });
    setCustomWidgets(prev => prev.map(w => w.id === widget.id ? { ...w, starred: updated.starred } : w));
  }

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
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content-primary">Dashboard</h1>
        <p className="text-sm text-content-muted mt-1">
          Workspace: {activeWorkspace.name}
        </p>
      </div>
      {previewWidget && (
        <WidgetPreview
          title={previewWidget.title}
          code={previewWidget.code}
          onAdd={() => addWidget(previewWidget)}
          onDiscard={() => setPreviewWidget(null)}
          onRevise={() => {
            useAppStore.getState().toggleAIPanel();
            setPreviewWidget(null);
          }}
        />
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <SegmentOverview />
        </div>
        <div>
          <ActivationFunnel />
        </div>
        <div>
          <HealthDistribution />
        </div>
        <div className="col-span-2">
          <SegmentMigration />
        </div>
        <div>
          <MarketComparison />
        </div>
        <div>
          <ChannelBreakdown />
        </div>
        <div className="col-span-2">
          <ActivityTimeline />
        </div>
      </div>
      {customWidgets.length > 0 && (
        <div className="mt-4 space-y-4">
          <h2 className="text-sm font-semibold text-content-primary">Custom Widgets</h2>
          {customWidgets.map(w => (
            <div key={w.id} className="relative">
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
                <button onClick={() => toggleStar(w)} className={`p-1 rounded ${w.starred ? 'text-yellow-500' : 'text-content-muted hover:text-content-secondary'}`}>
                  <Star size={14} fill={w.starred ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => setShowCode(showCode === w.id ? null : w.id)} className="p-1 text-content-muted hover:text-content-secondary">
                  <Code size={14} />
                </button>
                <button onClick={() => deleteWidget(w.id)} className="p-1 text-content-muted hover:text-[var(--danger)]">
                  <Trash2 size={14} />
                </button>
              </div>
              <WidgetSandbox code={w.code} title={w.title} />
              {showCode === w.id && (
                <pre className="mt-2 p-3 bg-surface-tertiary rounded-lg text-xs text-content-secondary overflow-x-auto max-h-60 overflow-y-auto">
                  {w.code}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
