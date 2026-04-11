import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import useAppStore from '../../stores/useAppStore.js';
import { api } from '../../utils/api.js';
import WidgetCard from './WidgetCard.jsx';

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

const SEGMENT_DESCRIPTIONS = {
  ghost: '0 visits, 30+ days since purchase',
  one_and_done: '1 visit, inactive 45+ days',
  approaching_threshold: '2-3 visits, nearing activation',
  in_the_zone: '4-10 visits, likely to renew',
  power_user: '11+ visits, brand ambassador',
  new_member: 'Recently joined, < 30 days',
};

const SEGMENT_ORDER = ['ghost', 'one_and_done', 'approaching_threshold', 'in_the_zone', 'power_user', 'new_member'];

export default function SegmentOverview() {
  const { activeWorkspaceId } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/data/segments?workspace=${activeWorkspaceId}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const segments = Array.isArray(data) ? data : (data?.segments || data || []);
  const totalMembers = segments.reduce((sum, s) => sum + (s.count || 0), 0);

  const barData = [
    SEGMENT_ORDER.reduce((acc, key) => {
      const seg = segments.find(s => s.segment === key);
      acc[key] = seg?.count || 0;
      return acc;
    }, { name: 'segments' }),
  ];

  return (
    <WidgetCard title="Segment Overview" subtitle="Member distribution across engagement segments" loading={loading} error={error} empty={!data}>
      <p className="text-xs text-content-muted mb-3">
        Members are segmented by visit behavior. The goal: move members from left (high risk) to right (low risk).
        Members with 4+ visits are dramatically more likely to renew.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {SEGMENT_ORDER.map(key => {
          const seg = segments.find(s => s.segment === key);
          const count = seg?.count || 0;
          const pct = totalMembers > 0 ? ((count / totalMembers) * 100).toFixed(1) : '0.0';
          return (
            <div
              key={key}
              className="bg-surface-tertiary rounded-lg p-3 border-l-4 cursor-pointer hover:bg-surface-secondary transition-colors"
              style={{ borderLeftColor: SEGMENT_COLORS[key] }}
              onClick={() => {
                const { setActivePage, setMemberFilter } = useAppStore.getState();
                setMemberFilter({ segment: key });
                setActivePage('members');
              }}
            >
              <p className="text-xs text-content-muted truncate">{SEGMENT_LABELS[key]}</p>
              <p className="text-lg font-semibold text-content-primary mt-1">{count.toLocaleString()}</p>
              <p className="text-xs text-content-muted">{pct}%</p>
              <p className="text-[10px] text-content-muted mt-0.5 leading-tight">{SEGMENT_DESCRIPTIONS[key]}</p>
            </div>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={48}>
        <BarChart data={barData} layout="vertical" stackOffset="expand" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
            formatter={(value, name) => [value.toLocaleString(), SEGMENT_LABELS[name] || name]}
          />
          {SEGMENT_ORDER.map(key => (
            <Bar key={key} dataKey={key} stackId="a" fill={SEGMENT_COLORS[key]} radius={0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}
