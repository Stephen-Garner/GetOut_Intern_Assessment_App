import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import useAppStore from '../../stores/useAppStore.js';
import { api } from '../../utils/api.js';
import WidgetCard from './WidgetCard.jsx';

const CHANNEL_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#22C55E', '#EAB308', '#06B6D4', '#EF4444'];

export default function ChannelBreakdown() {
  const { activeWorkspaceId } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/data/metrics?type=channel_breakdown&workspace=${activeWorkspaceId}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const channels = Array.isArray(data) ? data : (data?.channels || data || []);

  return (
    <WidgetCard title="Channel Breakdown" subtitle="Member distribution and performance by channel" loading={loading} error={error} empty={!data || channels.length === 0}>
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Donut chart */}
        <div className="flex-shrink-0">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={channels}
                dataKey="memberCount"
                nameKey="channel"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                strokeWidth={0}
              >
                {channels.map((_, i) => (
                  <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
                formatter={(value) => [value.toLocaleString(), 'Members']}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 px-2">
            {channels.map((ch, i) => (
              <div key={ch.channel} className="flex items-center gap-1.5 text-xs text-content-muted">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                {ch.channel}
              </div>
            ))}
          </div>
        </div>

        {/* Comparison table */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left text-xs font-medium text-content-muted pb-2 pr-3">Channel</th>
                <th className="text-right text-xs font-medium text-content-muted pb-2 pr-3">Members</th>
                <th className="text-right text-xs font-medium text-content-muted pb-2 pr-3">Avg Visits</th>
                <th className="text-right text-xs font-medium text-content-muted pb-2 pr-3">Avg Health</th>
                <th className="text-right text-xs font-medium text-content-muted pb-2">Ghost %</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, i) => {
                const isHighGhost = (ch.ghostPercent ?? ch.ghost_pct ?? 0) > 30;
                return (
                  <tr
                    key={ch.channel}
                    className={`border-b border-border-subtle last:border-0 ${isHighGhost ? 'bg-danger/5' : ''}`}
                  >
                    <td className="py-2 pr-3 font-medium text-content-primary">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                        {ch.channel}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-content-secondary">{(ch.memberCount ?? ch.members ?? 0).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right text-content-secondary">{(ch.avgVisits ?? ch.avg_visits ?? 0).toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right text-content-secondary">{(ch.avgHealthScore ?? ch.avg_health ?? 0).toFixed(1)}</td>
                    <td className={`py-2 text-right font-medium ${isHighGhost ? 'text-danger' : 'text-content-secondary'}`}>
                      {(ch.ghostPercent ?? ch.ghost_pct ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </WidgetCard>
  );
}
