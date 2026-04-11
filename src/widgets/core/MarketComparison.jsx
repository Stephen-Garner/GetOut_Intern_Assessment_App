import { useState, useEffect, useMemo } from 'react';
import { ArrowUpDown } from 'lucide-react';
import useAppStore from '../../stores/useAppStore.js';
import { api } from '../../utils/api.js';
import WidgetCard from './WidgetCard.jsx';

function ghostColor(pct) {
  if (pct > 30) return 'text-danger';
  if (pct > 20) return 'text-warning';
  return 'text-success';
}

function healthColor(score) {
  if (score < 30) return 'text-danger';
  if (score < 60) return 'text-warning';
  return 'text-success';
}

export default function MarketComparison() {
  const { activeWorkspaceId } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('members');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/data/metrics?type=market_comparison&workspace=${activeWorkspaceId}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const markets = data?.markets || [];

  const sorted = useMemo(() => {
    return [...markets].sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [markets, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const columns = [
    { key: 'market', label: 'Market' },
    { key: 'members', label: 'Members' },
    { key: 'ghost_pct', label: 'Ghost %' },
    { key: 'avg_health', label: 'Avg Health' },
    { key: 'first_use_rate', label: 'First Use Rate' },
  ];

  return (
    <WidgetCard title="Market Comparison" subtitle="Performance metrics across markets" loading={loading} error={error} empty={!data || markets.length === 0}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              {columns.map(col => (
                <th
                  key={col.key}
                  className="text-left text-xs font-medium text-content-muted pb-2 pr-4 cursor-pointer select-none hover:text-content-secondary transition-colors"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown size={12} className={sortKey === col.key ? 'text-accent' : 'opacity-30'} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.market || i} className="border-b border-border-subtle last:border-0">
                <td className="py-2.5 pr-4 font-medium text-content-primary">{row.market}</td>
                <td className="py-2.5 pr-4 text-content-secondary">{(row.members ?? 0).toLocaleString()}</td>
                <td className={`py-2.5 pr-4 font-medium ${ghostColor(row.ghost_pct ?? 0)}`}>
                  {(row.ghost_pct ?? 0).toFixed(1)}%
                </td>
                <td className={`py-2.5 pr-4 font-medium ${healthColor(row.avg_health ?? 0)}`}>
                  {(row.avg_health ?? 0).toFixed(1)}
                </td>
                <td className="py-2.5 pr-4 text-content-secondary">
                  {(row.first_use_rate ?? 0).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetCard>
  );
}
