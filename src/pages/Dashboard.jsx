import { useState, useEffect } from 'react';
import { ArrowRight, GripVertical, LayoutDashboard, MoreVertical, Sparkles } from 'lucide-react';
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

const CORE_WIDGETS = [
  { id: 'segment-overview', Component: SegmentOverview, colSpan: 2, label: 'Segment Overview' },
  { id: 'activation-funnel', Component: ActivationFunnel, colSpan: 1, label: 'Activation Funnel' },
  { id: 'health-distribution', Component: HealthDistribution, colSpan: 1, label: 'Health Distribution' },
  { id: 'segment-migration', Component: SegmentMigration, colSpan: 2, label: 'Segment Migration' },
  { id: 'market-comparison', Component: MarketComparison, colSpan: 1, label: 'Market Comparison' },
  { id: 'channel-breakdown', Component: ChannelBreakdown, colSpan: 1, label: 'Channel Breakdown' },
  { id: 'activity-timeline', Component: ActivityTimeline, colSpan: 2, label: 'Activity Timeline' },
];

function CoreWidgetMenu({ label, onHide }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!e.target.closest('[data-core-menu]')) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" data-core-menu>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-tertiary/80 transition-colors opacity-0 group-hover:opacity-100"
        title={`${label} options`}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-surface-primary border border-border-subtle rounded-xl shadow-lg z-50 py-1">
          <button
            onClick={() => { setOpen(false); onHide(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-tertiary transition-colors"
          >
            Hide widget
          </button>
        </div>
      )}
    </div>
  );
}

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
  isEditMode,
  widgetOrder,
  hiddenWidgets,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHideWidget,
  dragSrcId,
  setHiddenWidgets,
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
        {widgetOrder
          .filter((id) => !hiddenWidgets.has(id))
          .map((id) => {
            const coreWidget = CORE_WIDGETS.find((w) => w.id === id);
            const customWidget = customWidgets.find((w) => w.id === id);

            if (!coreWidget && !customWidget) return null;

            const colSpan = coreWidget?.colSpan ?? 1;
            const Comp = coreWidget?.Component;

            return (
              <div
                key={id}
                className={`${colSpan === 2 ? 'col-span-2' : ''} relative group ${
                  isEditMode ? 'cursor-grab active:cursor-grabbing' : ''
                } ${dragSrcId === id ? 'opacity-50' : ''}`}
                draggable={isEditMode}
                onDragStart={isEditMode ? (e) => onDragStart(e, id) : undefined}
                onDragOver={isEditMode ? (e) => onDragOver(e, id) : undefined}
                onDrop={isEditMode ? (e) => onDrop(e, id) : undefined}
                onDragEnd={isEditMode ? onDragEnd : undefined}
              >
                {isEditMode && (
                  <div className="absolute inset-0 rounded-lg border-2 border-dashed border-accent/30 pointer-events-none z-10" />
                )}

                {coreWidget && (
                  <div className="absolute top-2 right-2 z-20">
                    <CoreWidgetMenu
                      label={coreWidget.label}
                      onHide={() => onHideWidget(id)}
                    />
                  </div>
                )}
                {customWidget && (
                  <div className="absolute top-2 right-2 z-20">
                    <WidgetMenu
                      widget={customWidget}
                      onViewCode={() => onToggleCode(customWidget.id)}
                      onEditWithAI={() => onEditWidget(customWidget)}
                      onToggleStar={() => onToggleStar(customWidget)}
                      onDelete={() => onDeleteWidget(customWidget.id)}
                    />
                  </div>
                )}

                {coreWidget ? (
                  <Comp />
                ) : (
                  <WidgetSandbox code={customWidget.code} title={customWidget.title} />
                )}

                {showCode === id && customWidget && (
                  <pre className="mt-2 p-3 bg-surface-tertiary rounded-lg text-xs text-content-secondary overflow-x-auto max-h-60 overflow-y-auto">
                    {customWidget.code}
                  </pre>
                )}
              </div>
            );
          })}
      </div>

      {isEditMode && hiddenWidgets.size > 0 && (
        <div className="mt-4 p-4 bg-surface-secondary border border-border-subtle rounded-xl">
          <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-3">Hidden Widgets</p>
          <div className="flex flex-wrap gap-2">
            {[...hiddenWidgets].map((id) => {
              const label =
                CORE_WIDGETS.find((w) => w.id === id)?.label ||
                customWidgets.find((w) => w.id === id)?.title ||
                id;
              return (
                <button
                  key={id}
                  onClick={() =>
                    setHiddenWidgets((prev) => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                    })
                  }
                  className="px-3 py-1 text-xs border border-border-subtle rounded-full text-content-secondary hover:bg-surface-tertiary transition-colors"
                >
                  + Restore {label}
                </button>
              );
            })}
          </div>
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
  } = useAppStore();
  const { activeWorkspace, updateWorkspace } = useWorkspace();
  const [customWidgets, setCustomWidgets] = useState([]);
  const [previewWidget, setPreviewWidget] = useState(null);
  const [showCode, setShowCode] = useState(null);
  const [editingWidget, setEditingWidget] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState([]);
  const [hiddenWidgets, setHiddenWidgets] = useState(new Set());
  const [dragSrcId, setDragSrcId] = useState(null);

  useEffect(() => {
    if (!activeWorkspace) {
      setCustomWidgets([]);
      setEditingWidget(null);
      return;
    }

    api.get(`/widgets?workspace=${activeWorkspace.id}`)
      .then((widgets) => {
        setCustomWidgets(widgets);

        const coreIds = CORE_WIDGETS.map((w) => w.id);
        const customIds = widgets.map((w) => w.id);
        const saved = activeWorkspace?.dashboardLayout;

        if (saved && Array.isArray(saved) && saved.length > 0) {
          const savedIds = saved.map((item) => item.id ?? item);
          const allIds = [...coreIds, ...customIds];
          const newIds = allIds.filter((id) => !savedIds.includes(id));
          setWidgetOrder([
            ...savedIds.filter((id) => allIds.includes(id)),
            ...newIds,
          ]);
          const hidden = saved.filter((item) => item.hidden).map((item) => item.id ?? item);
          setHiddenWidgets(new Set(hidden));
        } else {
          setWidgetOrder([...coreIds, ...customIds]);
        }
      })
      .catch(() => {
        setCustomWidgets([]);
        const coreIds = CORE_WIDGETS.map((w) => w.id);
        setWidgetOrder(coreIds);
      });
  }, [activeWorkspace]);

  useEffect(() => {
    function handleWidgetAdded(event) {
      const widget = event.detail;
      if (!widget) return;
      setCustomWidgets((current) => {
        const exists = current.some((item) => item.id === widget.id);
        const updated = exists
          ? current.map((item) => (item.id === widget.id ? widget : item))
          : [...current, widget];
        if (!exists) {
          setWidgetOrder((prev) =>
            prev.includes(widget.id) ? prev : [...prev, widget.id]
          );
        }
        return updated;
      });
    }

    window.addEventListener('beacon-dashboard-widget-added', handleWidgetAdded);

    return () => {
      window.removeEventListener('beacon-dashboard-widget-added', handleWidgetAdded);
    };
  }, []);

  async function addWidget(widget) {
    const saved = await api.post(`/widgets?workspace=${activeWorkspace.id}`, widget);
    setCustomWidgets((current) => [...current, saved]);
    setWidgetOrder((prev) =>
      prev.includes(saved.id) ? prev : [...prev, saved.id]
    );
    setPreviewWidget(null);
  }

  async function deleteWidget(id) {
    await api.delete(`/widgets/${id}?workspace=${activeWorkspace.id}`);
    setCustomWidgets((current) => current.filter((widget) => widget.id !== id));
    setWidgetOrder((prev) => prev.filter((wid) => wid !== id));
    setHiddenWidgets((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
    setShowCode(null);
  }

  function handleDragStart(e, id) {
    setDragSrcId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, targetId) {
    e.preventDefault();
    if (!dragSrcId || dragSrcId === targetId) return;
    setWidgetOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragSrcId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragSrcId);
      return next;
    });
    setDragSrcId(null);
  }

  function handleDragEnd() {
    setDragSrcId(null);
  }

  function handleHideWidget(id) {
    setHiddenWidgets((prev) => new Set([...prev, id]));
  }

  async function saveLayout() {
    if (!activeWorkspace) return;
    const layout = widgetOrder.map((id) => ({ id, hidden: hiddenWidgets.has(id) }));
    await updateWorkspace(activeWorkspace.id, { dashboardLayout: layout });
    setIsEditMode(false);
  }

  return (
    <div className={dashboardTab === 'playground' ? 'min-h-full flex flex-col' : 'h-full flex flex-col overflow-hidden'}>
      <div className={`px-6 pt-6 pb-4 shrink-0${dashboardTab === 'playground' ? ' sticky top-0 z-10 bg-surface-primary' : ''}`}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-content-primary">Dashboard</h1>
            <p className="text-sm text-content-muted mt-1">
              Workspace: {activeWorkspace?.name || 'No active workspace'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {dashboardTab === 'main' && (
              isEditMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="px-3 py-1.5 text-sm text-content-secondary hover:text-content-primary border border-border-subtle rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveLayout}
                    className="px-3 py-1.5 text-sm font-medium bg-accent text-white hover:bg-accent-hover rounded-lg transition-colors"
                  >
                    Save Layout
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-content-secondary hover:text-content-primary border border-border-subtle rounded-lg transition-colors"
                >
                  <GripVertical size={14} />
                  Edit
                </button>
              )
            )}

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
      </div>

      {dashboardTab === 'playground' ? (
        <div className="flex-1 px-6 pb-6">
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
            setDashboardTab('playground');
            setPreviewWidget(null);
          }}
          onGoToSettings={() => setActivePage('settings')}
          isEditMode={isEditMode}
          widgetOrder={widgetOrder}
          hiddenWidgets={hiddenWidgets}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onHideWidget={handleHideWidget}
          dragSrcId={dragSrcId}
          setHiddenWidgets={setHiddenWidgets}
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
