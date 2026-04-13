import { useState, useEffect } from 'react';
import { ArrowRight, LayoutDashboard, Sparkles } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { api } from '../utils/api.js';
import WidgetSandbox from '../components/WidgetSandbox.jsx';
import WidgetPreview from '../components/WidgetPreview.jsx';
import PlaygroundPanel from '../components/PlaygroundPanel.jsx';
import SegmentOverview from '../widgets/core/SegmentOverview.jsx';
import ActivationFunnel from '../widgets/core/ActivationFunnel.jsx';
import HealthDistribution from '../widgets/core/HealthDistribution.jsx';
import SegmentMigration from '../widgets/core/SegmentMigration.jsx';
import MarketComparison from '../widgets/core/MarketComparison.jsx';
import ChannelBreakdown from '../widgets/core/ChannelBreakdown.jsx';
import ActivityTimeline from '../widgets/core/ActivityTimeline.jsx';
import WidgetMenu from '../components/WidgetMenu.jsx';
import WidgetEditModal from '../components/WidgetEditModal.jsx';

const DASHBOARD_TABS = [
  { id: 'main', label: 'Main', icon: LayoutDashboard },
  { id: 'playground', label: 'Playground', icon: Sparkles },
];

function DashboardMainContent({
  activeWorkspace,
  customWidgets,
  previewWidget,
  showCode,
  onAddWidget,
  onDeleteWidget,
  onToggleStar,
  onToggleCode,
  onEditWidget,
  onDiscardPreview,
  onRevisePreview,
  onGoToSettings,
}) {
  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 pb-6">
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
            onClick={onGoToSettings}
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
    <div className="flex-1 overflow-y-auto px-6 pb-6">
      {previewWidget && (
        <div className="mb-6">
          <WidgetPreview
            title={previewWidget.title}
            code={previewWidget.code}
            onAdd={() => onAddWidget(previewWidget)}
            onDiscard={onDiscardPreview}
            onRevise={onRevisePreview}
          />
        </div>
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
          {customWidgets.map((widget) => (
            <div key={widget.id} className="relative">
              <div className="absolute top-3 right-3 z-10">
                <WidgetMenu
                  widget={widget}
                  onViewCode={() => onToggleCode(widget.id)}
                  onEditWithAI={() => onEditWidget(widget)}
                  onToggleStar={() => onToggleStar(widget)}
                  onDelete={() => onDeleteWidget(widget.id)}
                />
              </div>
              <WidgetSandbox code={widget.code} title={widget.title} />
              {showCode === widget.id && (
                <pre className="mt-2 p-3 bg-surface-tertiary rounded-lg text-xs text-content-secondary overflow-x-auto max-h-60 overflow-y-auto">
                  {widget.code}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const {
    setActivePage,
    dashboardTab,
    setDashboardTab,
    toggleAIPanel,
  } = useAppStore();
  const { activeWorkspace } = useWorkspace();
  const [customWidgets, setCustomWidgets] = useState([]);
  const [previewWidget, setPreviewWidget] = useState(null);
  const [showCode, setShowCode] = useState(null);
  const [editingWidget, setEditingWidget] = useState(null);

  useEffect(() => {
    if (!activeWorkspace) {
      setCustomWidgets([]);
      return;
    }

    api.get(`/widgets?workspace=${activeWorkspace.id}`)
      .then(setCustomWidgets)
      .catch(() => setCustomWidgets([]));
  }, [activeWorkspace]);

  useEffect(() => {
    function handleWidgetPreview(event) {
      setPreviewWidget(event.detail);
      setDashboardTab('main');
    }

    function handleWidgetAdded(event) {
      const widget = event.detail;
      if (!widget) return;
      setCustomWidgets((current) => {
        const exists = current.some((item) => item.id === widget.id);
        return exists ? current.map((item) => (item.id === widget.id ? widget : item)) : [...current, widget];
      });
    }

    window.addEventListener('beacon-widget-preview', handleWidgetPreview);
    window.addEventListener('beacon-dashboard-widget-added', handleWidgetAdded);

    return () => {
      window.removeEventListener('beacon-widget-preview', handleWidgetPreview);
      window.removeEventListener('beacon-dashboard-widget-added', handleWidgetAdded);
    };
  }, [setDashboardTab]);

  async function addWidget(widget) {
    const saved = await api.post(`/widgets?workspace=${activeWorkspace.id}`, widget);
    setCustomWidgets((current) => [...current, saved]);
    setPreviewWidget(null);
  }

  async function deleteWidget(id) {
    await api.delete(`/widgets/${id}?workspace=${activeWorkspace.id}`);
    setCustomWidgets((current) => current.filter((widget) => widget.id !== id));
  }

  async function toggleStar(widget) {
    const updated = await api.put(`/widgets/${widget.id}?workspace=${activeWorkspace.id}`, {
      starred: !widget.starred,
    });
    setCustomWidgets((current) =>
      current.map((item) => (item.id === widget.id ? { ...item, starred: updated.starred } : item))
    );
  }

  function handleWidgetSaved(updatedWidget) {
    setCustomWidgets((current) =>
      current.map((w) => (w.id === updatedWidget.id ? updatedWidget : w))
    );
    setEditingWidget(null);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-content-primary">Dashboard</h1>
            <p className="text-sm text-content-muted mt-1">
              Workspace: {activeWorkspace?.name || 'No active workspace'}
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl bg-surface-secondary border border-border-subtle p-1">
            {DASHBOARD_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setDashboardTab(id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dashboardTab === id
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-tertiary'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dashboardTab === 'playground' ? (
        <div className="flex-1 min-h-0 px-6">
          <PlaygroundPanel
            activeWorkspace={activeWorkspace}
            onGoToSettings={() => setActivePage('settings')}
          />
        </div>
      ) : (
        <DashboardMainContent
          activeWorkspace={activeWorkspace}
          customWidgets={customWidgets}
          previewWidget={previewWidget}
          showCode={showCode}
          onAddWidget={addWidget}
          onDeleteWidget={deleteWidget}
          onToggleStar={toggleStar}
          onToggleCode={(id) => setShowCode((current) => (current === id ? null : id))}
          onEditWidget={setEditingWidget}
          onDiscardPreview={() => setPreviewWidget(null)}
          onRevisePreview={() => {
            toggleAIPanel();
            setPreviewWidget(null);
          }}
          onGoToSettings={() => setActivePage('settings')}
        />
      )}
      {editingWidget && (
        <WidgetEditModal
          widget={editingWidget}
          workspaceId={activeWorkspace?.id}
          onSave={handleWidgetSaved}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
