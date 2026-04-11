import { useState, useEffect, useCallback } from 'react';
import { Zap, AlertTriangle, DollarSign, Users, Loader2 } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { api } from '../utils/api.js';

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
  new_member: 'New Member',
};

const CHURN_PROBABILITY = {
  ghost: 0.9,
  one_and_done: 0.75,
};

const AVG_PLAN_PRICE = 49;

function SegmentBadge({ segment }) {
  const color = SEGMENT_COLORS[segment] || '#6B7280';
  const label = SEGMENT_LABELS[segment] || segment;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function HealthDot({ score }) {
  const numScore = Number(score) || 0;
  let color = '#EF4444';
  if (numScore >= 70) color = '#22C55E';
  else if (numScore >= 40) color = '#EAB308';

  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-sm text-content-primary">{numScore}</span>
    </div>
  );
}

function StatusBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-500">
      Pending
    </span>
  );
}

export default function Interventions() {
  const { setActivePage } = useAppStore();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();

  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadInterventions = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/data/interventions?workspace=${activeWorkspaceId}`);
      setInterventions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load interventions:', err);
      setError(err.message);
      setInterventions([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadInterventions();
  }, [loadInterventions]);

  // Compute summary stats
  const totalNeedingIntervention = interventions.length;

  const segmentCounts = interventions.reduce((acc, item) => {
    const seg = item.segment || 'unknown';
    acc[seg] = (acc[seg] || 0) + 1;
    return acc;
  }, {});

  const revenueAtRisk = interventions.reduce((sum, item) => {
    const seg = item.segment;
    const prob = CHURN_PROBABILITY[seg];
    if (prob) {
      return sum + AVG_PLAN_PRICE * prob;
    }
    return sum;
  }, 0);

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--danger)]/10 flex items-center justify-center">
            <Zap size={28} className="text-[var(--danger)]/50" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">Connect a Data Source First</h2>
          <p className="text-sm text-content-muted mb-6 leading-relaxed">
            Import your member data in Settings to start identifying members who need intervention.
          </p>
          <button
            onClick={() => setActivePage('settings')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-content-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--danger)]/10 flex items-center justify-center">
            <AlertTriangle size={28} className="text-[var(--danger)]/50" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">Failed to Load Interventions</h2>
          <p className="text-sm text-content-muted mb-4 leading-relaxed">{error}</p>
          <button
            onClick={loadInterventions}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (interventions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Zap size={28} className="text-accent/50" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">No Interventions Needed</h2>
          <p className="text-sm text-content-muted leading-relaxed">
            All members are currently healthy. Check back later or adjust your segmentation thresholds in Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content-primary">Interventions</h1>
        <p className="text-sm text-content-muted mt-1">
          Workspace: {activeWorkspace.name}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Total needing intervention */}
        <div className="p-4 rounded-lg bg-surface-secondary border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-content-muted" />
            <span className="text-xs font-medium text-content-muted uppercase tracking-wider">Needs Intervention</span>
          </div>
          <p className="text-2xl font-bold text-content-primary">{totalNeedingIntervention}</p>
        </div>

        {/* Segment breakdown */}
        <div className="p-4 rounded-lg bg-surface-secondary border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-content-muted" />
            <span className="text-xs font-medium text-content-muted uppercase tracking-wider">By Segment</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(segmentCounts).map(([seg, count]) => (
              <span
                key={seg}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${SEGMENT_COLORS[seg] || '#6B7280'}20`,
                  color: SEGMENT_COLORS[seg] || '#6B7280',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: SEGMENT_COLORS[seg] || '#6B7280' }}
                />
                {SEGMENT_LABELS[seg] || seg}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Revenue at risk */}
        <div className="p-4 rounded-lg bg-surface-secondary border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-content-muted" />
            <span className="text-xs font-medium text-content-muted uppercase tracking-wider">Revenue at Risk</span>
          </div>
          <p className="text-2xl font-bold text-content-primary">
            ${revenueAtRisk.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-content-muted mt-1">Ghost 90% churn, One & Done 75%</p>
        </div>
      </div>

      {/* Intervention Queue Table */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-secondary border-b border-border-subtle">
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Segment</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Health</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Market</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Trigger Reason</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Recommended Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-content-muted uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {interventions.map((item, idx) => (
              <tr
                key={item.member_id || idx}
                className="hover:bg-surface-tertiary transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-content-primary font-medium">
                  {item.name || item.member_id || `Member ${idx + 1}`}
                </td>
                <td className="px-4 py-3">
                  <SegmentBadge segment={item.segment} />
                </td>
                <td className="px-4 py-3">
                  <HealthDot score={item.health_score} />
                </td>
                <td className="px-4 py-3 text-content-secondary">
                  {item.market || 'N/A'}
                </td>
                <td className="px-4 py-3 text-content-secondary max-w-[200px] truncate">
                  {item.trigger_reason || 'At-risk segment detected'}
                </td>
                <td className="px-4 py-3 text-content-secondary max-w-[200px] truncate">
                  {item.recommended_action || 'Review member profile'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
