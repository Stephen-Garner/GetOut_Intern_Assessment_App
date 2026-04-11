import { LayoutDashboard, ArrowRight } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
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
    </div>
  );
}
