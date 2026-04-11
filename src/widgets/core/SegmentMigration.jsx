import { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
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

const SEGMENT_ORDER = ['ghost', 'one_and_done', 'approaching_threshold', 'in_the_zone', 'power_user', 'new_member'];

function cellOpacity(value, maxValue) {
  if (!value || maxValue === 0) return 0;
  return Math.max(0.15, value / maxValue);
}

export default function SegmentMigration() {
  const { activeWorkspaceId } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/data/migration?workspace=${activeWorkspaceId}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const matrix = data?.matrix;
  const hasData = matrix && Object.keys(matrix).length > 0;

  return (
    <WidgetCard title="Segment Migration" subtitle="Member movement between segments over time" loading={loading} error={error} empty={false}>
      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
            <ArrowRightLeft size={22} className="text-accent/50" />
          </div>
          <p className="text-sm text-content-muted max-w-sm leading-relaxed">
            Migration data requires at least 2 data periods. Import another snapshot to see member movement.
          </p>
        </div>
      ) : (
        <MigrationMatrix matrix={matrix} />
      )}
    </WidgetCard>
  );
}

function MigrationMatrix({ matrix }) {
  let maxVal = 0;
  for (const from of SEGMENT_ORDER) {
    for (const to of SEGMENT_ORDER) {
      const val = matrix[from]?.[to] || 0;
      if (val > maxVal) maxVal = val;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left text-content-muted font-medium pb-2 pr-2">From / To</th>
            {SEGMENT_ORDER.map(key => (
              <th key={key} className="text-center text-content-muted font-medium pb-2 px-1" style={{ minWidth: 64 }}>
                {SEGMENT_LABELS[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEGMENT_ORDER.map(from => (
            <tr key={from}>
              <td className="py-1 pr-2 font-medium text-content-secondary whitespace-nowrap">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: SEGMENT_COLORS[from] }} />
                {SEGMENT_LABELS[from]}
              </td>
              {SEGMENT_ORDER.map(to => {
                const val = matrix[from]?.[to] || 0;
                const isDiagonal = from === to;
                return (
                  <td key={to} className="text-center py-1 px-1">
                    <div
                      className="rounded px-1 py-0.5 font-medium"
                      style={{
                        backgroundColor: val > 0
                          ? `${isDiagonal ? '#3B82F6' : '#8B5CF6'}${Math.round(cellOpacity(val, maxVal) * 255).toString(16).padStart(2, '0')}`
                          : 'transparent',
                        color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {val > 0 ? val.toLocaleString() : '\u2014'}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
