import { useState, useEffect, useMemo } from 'react';
import { Calculator, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { api } from '../utils/api.js';

const DEFAULT_RENEWAL_RATES = {
  ghost: 0.10,
  one_and_done: 0.25,
  approaching_threshold: 0.50,
  in_the_zone: 0.75,
  power_user: 0.90,
  new_member: 0.50,
};

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

const SEGMENT_ORDER = [
  'ghost',
  'one_and_done',
  'approaching_threshold',
  'in_the_zone',
  'power_user',
  'new_member',
];

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Simulator() {
  const { activeWorkspaceId } = useAppStore();
  const { activeWorkspace } = useWorkspace();

  const [summary, setSummary] = useState(null);
  const [segments, setSegments] = useState(null);
  const [loading, setLoading] = useState(false);

  // Scenario sliders
  const [ghostConvert, setGhostConvert] = useState(0);
  const [oneAndDoneConvert, setOneAndDoneConvert] = useState(0);
  const [approachingConvert, setApproachingConvert] = useState(0);

  // Assumptions
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [renewalRates, setRenewalRates] = useState({ ...DEFAULT_RENEWAL_RATES });
  const [avgPlanPrice, setAvgPlanPrice] = useState(50);

  useEffect(() => {
    if (!activeWorkspaceId) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.get(`/data/summary?workspace=${activeWorkspaceId}`),
      api.get(`/data/segments?workspace=${activeWorkspaceId}`),
    ])
      .then(([summaryData, segmentsData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setSegments(segmentsData);
        if (summaryData.avgPlanPrice) {
          setAvgPlanPrice(summaryData.avgPlanPrice);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load simulator data:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  // Build segment counts from data
  const segmentCounts = useMemo(() => {
    if (!segments) return {};
    const counts = {};
    for (const seg of SEGMENT_ORDER) {
      const found = segments.find((s) => s.segment === seg);
      counts[seg] = found ? found.count : 0;
    }
    return counts;
  }, [segments]);

  const totalMembers = useMemo(() => {
    return Object.values(segmentCounts).reduce((sum, c) => sum + c, 0);
  }, [segmentCounts]);

  // Calculate current and projected
  const { currentRevenue, projectedRevenue, projectedCounts } = useMemo(() => {
    const current = {};
    let curRev = 0;

    for (const seg of SEGMENT_ORDER) {
      const count = segmentCounts[seg] || 0;
      current[seg] = count;
      curRev += count * renewalRates[seg] * avgPlanPrice;
    }

    // Apply conversions
    const projected = { ...current };

    // Ghosts to One-and-Done
    const ghostsMoving = Math.round(projected.ghost * (ghostConvert / 100));
    projected.ghost -= ghostsMoving;
    projected.one_and_done += ghostsMoving;

    // One-and-Done to Approaching
    const oadMoving = Math.round(projected.one_and_done * (oneAndDoneConvert / 100));
    projected.one_and_done -= oadMoving;
    projected.approaching_threshold += oadMoving;

    // Approaching to In the Zone
    const appMoving = Math.round(projected.approaching_threshold * (approachingConvert / 100));
    projected.approaching_threshold -= appMoving;
    projected.in_the_zone += appMoving;

    let projRev = 0;
    for (const seg of SEGMENT_ORDER) {
      projRev += projected[seg] * renewalRates[seg] * avgPlanPrice;
    }

    return {
      currentRevenue: curRev,
      projectedRevenue: projRev,
      projectedCounts: projected,
    };
  }, [segmentCounts, renewalRates, avgPlanPrice, ghostConvert, oneAndDoneConvert, approachingConvert]);

  const revenueDelta = projectedRevenue - currentRevenue;

  // Build chart data
  const revenueChartData = [
    { name: 'Current', revenue: Math.round(currentRevenue) },
    { name: 'Projected', revenue: Math.round(projectedRevenue) },
  ];

  const segmentChartData = SEGMENT_ORDER.map((seg) => ({
    name: SEGMENT_LABELS[seg],
    Current: segmentCounts[seg] || 0,
    Projected: projectedCounts[seg] || 0,
    color: SEGMENT_COLORS[seg],
  }));

  // Generate insight
  const insightText = useMemo(() => {
    if (revenueDelta <= 0) {
      return 'Adjust the sliders above to see how moving members between segments impacts your retained revenue.';
    }
    const parts = [];
    if (ghostConvert > 0) parts.push(`${ghostConvert}% of Ghost members to One & Done`);
    if (oneAndDoneConvert > 0) parts.push(`${oneAndDoneConvert}% of One & Done members to Approaching`);
    if (approachingConvert > 0) parts.push(`${approachingConvert}% of Approaching members to In the Zone`);

    const action = parts.length > 0 ? `Converting ${parts.join(', and ')}` : 'This scenario';
    return `${action} would retain an estimated ${formatCurrency(revenueDelta)} in additional annual revenue.`;
  }, [revenueDelta, ghostConvert, oneAndDoneConvert, approachingConvert]);

  function handleRenewalRateChange(segment, value) {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    setRenewalRates((prev) => ({ ...prev, [segment]: Math.min(100, Math.max(0, parsed)) / 100 }));
  }

  // Empty state
  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Calculator size={28} className="text-accent/50" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">ROI Simulator</h2>
          <p className="text-sm text-content-muted mb-6 leading-relaxed">
            Connect a data source to use the ROI Simulator
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-content-muted">Loading simulator data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex-1 overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content-primary">ROI Simulator</h1>
        <p className="text-sm text-content-muted mt-1">
          Model the revenue impact of improving member engagement
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left side: Input controls */}
        <div className="space-y-5">
          {/* Current state summary */}
          <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
            <h3 className="text-sm font-semibold text-content-primary mb-3">Current State</h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs text-content-muted">Total Members</p>
                <p className="text-lg font-semibold text-content-primary">{totalMembers.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-content-muted">Est. Annual Revenue</p>
                <p className="text-lg font-semibold text-content-primary">{formatCurrency(currentRevenue)}</p>
              </div>
            </div>

            {/* Segment distribution bars */}
            <p className="text-xs text-content-muted mb-2">Segment Distribution</p>
            <div className="space-y-1.5">
              {SEGMENT_ORDER.map((seg) => {
                const count = segmentCounts[seg] || 0;
                const pct = totalMembers > 0 ? (count / totalMembers) * 100 : 0;
                return (
                  <div key={seg} className="flex items-center gap-2">
                    <span className="text-xs text-content-secondary w-24 truncate">{SEGMENT_LABELS[seg]}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-surface-tertiary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: SEGMENT_COLORS[seg] }}
                      />
                    </div>
                    <span className="text-xs text-content-muted w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scenario sliders */}
          <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
            <h3 className="text-sm font-semibold text-content-primary mb-4">Scenario Sliders</h3>

            <div className="space-y-4">
              <SliderInput
                label="Convert Ghosts to One & Done"
                value={ghostConvert}
                onChange={setGhostConvert}
                fromColor={SEGMENT_COLORS.ghost}
                toColor={SEGMENT_COLORS.one_and_done}
              />
              <SliderInput
                label="Convert One & Done to Approaching"
                value={oneAndDoneConvert}
                onChange={setOneAndDoneConvert}
                fromColor={SEGMENT_COLORS.one_and_done}
                toColor={SEGMENT_COLORS.approaching_threshold}
              />
              <SliderInput
                label="Convert Approaching to In the Zone"
                value={approachingConvert}
                onChange={setApproachingConvert}
                fromColor={SEGMENT_COLORS.approaching_threshold}
                toColor={SEGMENT_COLORS.in_the_zone}
              />
            </div>
          </div>

          {/* Assumptions panel */}
          <div className="rounded-lg border border-border-subtle bg-surface-secondary">
            <button
              onClick={() => setShowAssumptions((prev) => !prev)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold text-content-primary"
            >
              <span>Assumptions</span>
              {showAssumptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAssumptions && (
              <div className="px-4 pb-4 space-y-3 border-t border-border-subtle pt-3">
                <div>
                  <label className="text-xs text-content-muted block mb-1">Avg Plan Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    value={avgPlanPrice}
                    onChange={(e) => setAvgPlanPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border-subtle bg-surface-primary text-content-primary"
                  />
                </div>

                <p className="text-xs text-content-muted font-medium pt-1">Renewal Rates by Segment</p>
                {SEGMENT_ORDER.map((seg) => (
                  <div key={seg} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[seg] }} />
                    <span className="text-xs text-content-secondary flex-1">{SEGMENT_LABELS[seg]}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(renewalRates[seg] * 100)}
                        onChange={(e) => handleRenewalRateChange(seg, e.target.value)}
                        className="w-16 px-2 py-1 text-xs text-right rounded-md border border-border-subtle bg-surface-primary text-content-primary"
                      />
                      <span className="text-xs text-content-muted">%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Impact visualization */}
        <div className="space-y-5">
          {/* Revenue comparison */}
          <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
            <h3 className="text-sm font-semibold text-content-primary mb-1">Revenue Comparison</h3>
            {revenueDelta > 0 && (
              <p className="text-lg font-bold text-green-500 mb-3">
                +{formatCurrency(revenueDelta)} additional retained revenue
              </p>
            )}
            {revenueDelta === 0 && (
              <p className="text-sm text-content-muted mb-3">Adjust sliders to model revenue impact</p>
            )}

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChartData} barCategoryGap="30%">
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'var(--color-content-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: 'var(--color-content-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-secondary)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    <Cell fill="#6B7280" />
                    <Cell fill="#22C55E" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Projected segment distribution */}
          <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
            <h3 className="text-sm font-semibold text-content-primary mb-3">Segment Distribution: Current vs Projected</h3>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentChartData} barCategoryGap="20%">
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: 'var(--color-content-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-content-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-secondary)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                  <Bar dataKey="Current" fill="#6B7280" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Projected" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Key insight callout */}
          <div className="rounded-lg border border-border-subtle bg-accent/5 p-4 flex items-start gap-3">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-accent/15 flex items-center justify-center mt-0.5">
              <TrendingUp size={16} className="text-accent" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-content-primary mb-1">Key Insight</h4>
              <p className="text-sm text-content-secondary leading-relaxed">{insightText}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderInput({ label, value, onChange, fromColor, toColor }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-content-secondary">{label}</label>
        <span className="text-xs font-semibold text-content-primary">{value}%</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fromColor }} />
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1 h-1.5 accent-accent cursor-pointer"
        />
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: toColor }} />
      </div>
    </div>
  );
}
