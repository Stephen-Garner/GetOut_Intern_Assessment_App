import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import useAppStore from '../../stores/useAppStore.js';
import { api } from '../../utils/api.js';
import WidgetCard from './WidgetCard.jsx';
import HealthScoreTooltip from '../../components/HealthScoreTooltip.jsx';

function binColor(index, total) {
  const ratio = index / (total - 1);
  if (ratio < 0.3) return '#EF4444';
  if (ratio < 0.5) return '#F97316';
  if (ratio < 0.7) return '#EAB308';
  return '#22C55E';
}

export default function HealthDistribution() {
  const { activeWorkspaceId } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/data/metrics?type=health_distribution&workspace=${activeWorkspaceId}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const bins = data?.bins || [];
  const mean = data?.mean ?? null;
  const median = data?.median ?? null;

  return (
    <WidgetCard title={<span className="inline-flex items-center gap-1.5">Health Score Distribution <HealthScoreTooltip /></span>} subtitle="Distribution of member health scores across bins" loading={loading} error={error} empty={!data || bins.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={bins} margin={{ top: 5, right: 10, bottom: 5, left: 15 }}>
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: 'var(--text-secondary, #9196A8)' }}
            axisLine={{ stroke: 'var(--border-primary)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-secondary, #9196A8)' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
            formatter={(value) => [value.toLocaleString(), 'Members']}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {bins.map((_, i) => (
              <Cell key={i} fill={binColor(i, bins.length)} />
            ))}
          </Bar>
          {mean !== null && (
            <ReferenceLine
              x={mean}
              stroke="var(--accent)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{ value: 'Mean', position: 'top', fontSize: 10, fill: 'var(--accent)' }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      {(mean !== null || median !== null) && (
        <div className="flex gap-6 mt-3 text-xs text-content-muted">
          {mean !== null && <span>Mean: <strong className="text-content-primary">{mean.toFixed(1)}</strong></span>}
          {median !== null && <span>Median: <strong className="text-content-primary">{median.toFixed(1)}</strong></span>}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 justify-center">
        {[
          { label: 'Critical (0-25)', color: '#EF4444' },
          { label: 'At Risk (26-50)', color: '#F97316' },
          { label: 'Healthy (51-75)', color: '#EAB308' },
          { label: 'Strong (76-100)', color: '#22C55E' },
        ].map(r => (
          <div key={r.label} className="flex items-center gap-1.5 text-xs text-content-muted">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
            {r.label}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
