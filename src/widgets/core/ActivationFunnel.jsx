import { useState, useEffect } from 'react';
import useAppStore from '../../stores/useAppStore.js';
import { api } from '../../utils/api.js';
import WidgetCard from './WidgetCard.jsx';

const FUNNEL_COLORS = ['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'];

export default function ActivationFunnel() {
  const { activeWorkspaceId } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/data/metrics?type=funnel&workspace=${activeWorkspaceId}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const stages = data?.stages || [];
  const maxCount = stages.length > 0 ? stages[0].count : 1;

  return (
    <WidgetCard title="Activation Funnel" subtitle="Member progression through key milestones" loading={loading} error={error} empty={!data || stages.length === 0}>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const widthPct = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 8) : 8;
          const conversionRate = i > 0 && stages[i - 1].count > 0
            ? ((stage.count / stages[i - 1].count) * 100).toFixed(1)
            : null;

          return (
            <div key={stage.name || i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-content-primary">{stage.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-content-primary">{stage.count.toLocaleString()}</span>
                  {conversionRate !== null && (
                    <span className="text-xs text-content-muted">({conversionRate}%)</span>
                  )}
                </div>
              </div>
              <div className="h-8 bg-surface-tertiary rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: FUNNEL_COLORS[i] || FUNNEL_COLORS[FUNNEL_COLORS.length - 1],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}
