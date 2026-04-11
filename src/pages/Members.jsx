import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { api } from '../utils/api.js';
import MemberDetailPanel from '../components/MemberDetailPanel.jsx';
import HealthScoreTooltip from '../components/HealthScoreTooltip.jsx';

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

const SEGMENT_KEYS = Object.keys(SEGMENT_COLORS);
const PAGE_LIMIT = 50;

export default function Members() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const memberFilter = useAppStore((s) => s.memberFilter);
  const appliedFilter = useRef(false);

  // Data state
  const [members, setMembers] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter state
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('_health_score');
  const [order, setOrder] = useState('desc');
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [market, setMarket] = useState('');
  const [channel, setChannel] = useState('');
  const [healthMin, setHealthMin] = useState('');
  const [healthMax, setHealthMax] = useState('');
  const [search, setSearch] = useState('');
  const [segmentDropdownOpen, setSegmentDropdownOpen] = useState(false);

  // Detail panel
  const [selectedMember, setSelectedMember] = useState(null);

  // Dropdown options (populated from data)
  const [markets, setMarkets] = useState([]);
  const [channels, setChannels] = useState([]);

  const fetchMembers = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        workspace: activeWorkspaceId,
        page: String(page),
        limit: String(PAGE_LIMIT),
        sort,
        order,
      });
      if (selectedSegments.length > 0) params.set('segment', selectedSegments.join(','));
      if (market) params.set('market', market);
      if (channel) params.set('channel', channel);
      if (healthMin !== '') params.set('health_min', healthMin);
      if (healthMax !== '') params.set('health_max', healthMax);
      if (search.trim()) params.set('search', search.trim());

      const data = await api.get(`/data/members?${params.toString()}`);
      setMembers(data.members || data.data || []);
      setTotalPages(data.totalPages || data.total_pages || 1);
      setTotalCount(data.total || data.totalCount || 0);

      // Extract unique markets and channels for filter dropdowns
      if (data.markets) setMarkets(data.markets);
      if (data.channels) setChannels(data.channels);
    } catch (err) {
      setError(err.message);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, page, sort, order, selectedSegments, market, channel, healthMin, healthMax, search]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Fetch filter options once when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    (async () => {
      try {
        const data = await api.get(`/data/members?workspace=${activeWorkspaceId}&page=1&limit=1`);
        if (data.markets) setMarkets(data.markets);
        if (data.channels) setChannels(data.channels);
      } catch {
        // Silently fail, filters just won't have options
      }
    })();
  }, [activeWorkspaceId]);

  // Apply member filter from store on mount (e.g. from segment card click)
  useEffect(() => {
    if (memberFilter && !appliedFilter.current) {
      appliedFilter.current = true;
      if (memberFilter.segment) {
        setSelectedSegments([memberFilter.segment]);
      }
      useAppStore.getState().setMemberFilter(null);
    }
  }, [memberFilter]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedSegments, market, channel, healthMin, healthMax, search]);

  function handleSort(column) {
    if (sort === column) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      setOrder('desc');
    }
  }

  function toggleSegment(seg) {
    setSelectedSegments((prev) =>
      prev.includes(seg) ? prev.filter((s) => s !== seg) : [...prev, seg]
    );
  }

  if (!activeWorkspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Users size={28} className="text-accent/50" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">Member Explorer</h2>
          <p className="text-sm text-content-muted leading-relaxed">
            Select a workspace to explore member activation profiles.
          </p>
        </div>
      </div>
    );
  }

  const SortIcon = ({ column }) => {
    if (sort !== column) return <ChevronDown size={12} className="text-content-muted/40" />;
    return order === 'asc' ? (
      <ChevronUp size={12} className="text-accent" />
    ) : (
      <ChevronDown size={12} className="text-accent" />
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-content-primary">Member Explorer</h1>
        <p className="text-sm text-content-muted mt-1">
          {totalCount > 0 ? `${totalCount} members` : 'Search and filter member profiles'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent w-52"
          />
        </div>

        {/* Segment multi-select */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setSegmentDropdownOpen((v) => !v)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary hover:bg-surface-tertiary transition-colors flex items-center gap-2"
          >
            Segment
            {selectedSegments.length > 0 && (
              <span className="bg-accent text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {selectedSegments.length}
              </span>
            )}
            <ChevronDown size={12} />
          </button>
          {segmentDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSegmentDropdownOpen(false)} />
              <div className="absolute top-full mt-1 left-0 z-20 bg-surface-primary border border-border-subtle rounded-lg shadow-lg py-1 w-48">
                {SEGMENT_KEYS.map((seg) => (
                  <button
                    key={seg}
                    type="button"
                    onClick={() => toggleSegment(seg)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-tertiary flex items-center gap-2 transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: SEGMENT_COLORS[seg] }}
                    />
                    <span className="text-content-primary flex-1">{SEGMENT_LABELS[seg]}</span>
                    {selectedSegments.includes(seg) && (
                      <span className="text-accent text-xs font-bold">&#10003;</span>
                    )}
                  </button>
                ))}
                {selectedSegments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSegments([])}
                    className="w-full text-left px-3 py-1.5 text-xs text-content-muted hover:bg-surface-tertiary border-t border-border-subtle mt-1 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Market dropdown */}
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Markets</option>
          {markets.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Channel dropdown */}
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Channels</option>
          {channels.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Health range */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-content-muted">Health:</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Min"
            value={healthMin}
            onChange={(e) => setHealthMin(e.target.value)}
            className="w-16 px-2 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="text-content-muted text-xs">to</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Max"
            value={healthMax}
            onChange={(e) => setHealthMax(e.target.value)}
            className="w-16 px-2 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Clear filters */}
        {(selectedSegments.length > 0 || market || channel || healthMin || healthMax || search) && (
          <button
            type="button"
            onClick={() => {
              setSelectedSegments([]);
              setMarket('');
              setChannel('');
              setHealthMin('');
              setHealthMax('');
              setSearch('');
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={12} />
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border-subtle">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary sticky top-0 z-[1]">
            <tr>
              {[
                { key: '_health_score', label: 'Health', hasTooltip: true },
                { key: 'last_name', label: 'Name' },
                { key: 'home_market', label: 'Market' },
                { key: '_segment', label: 'Segment' },
                { key: 'total_visits', label: 'Visits' },
                { key: 'last_visit_date', label: 'Last Visit' },
                { key: 'days_to_renewal', label: 'Days to Renewal' },
                { key: 'channel', label: 'Channel' },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2.5 text-left text-xs font-medium text-content-muted uppercase tracking-wider cursor-pointer hover:text-content-primary select-none whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.hasTooltip && <HealthScoreTooltip />}
                    <SortIcon column={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading && members.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-content-muted text-sm">
                  Loading members...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-content-muted text-sm">
                  No members found matching your filters.
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const healthScore = m._health_score ?? 0;
                const healthColor =
                  healthScore >= 60 ? '#22C55E' : healthScore >= 30 ? '#EAB308' : '#EF4444';
                const segColor = SEGMENT_COLORS[m._segment] || '#6B7280';
                const segLabel = SEGMENT_LABELS[m._segment] || m._segment;

                return (
                  <tr
                    key={m.id || m.email}
                    onClick={() => setSelectedMember(m)}
                    className="hover:bg-surface-tertiary cursor-pointer transition-colors"
                  >
                    {/* Health */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: healthColor }}
                        />
                        <span className="text-content-primary font-medium">{healthScore}</span>
                      </div>
                    </td>
                    {/* Name */}
                    <td className="px-3 py-2.5">
                      <div className="text-content-primary font-medium">
                        {m.first_name} {m.last_name}
                      </div>
                      <div className="text-xs text-content-muted truncate max-w-[200px]">
                        {m.email}
                      </div>
                    </td>
                    {/* Market */}
                    <td className="px-3 py-2.5 text-content-secondary">{m.home_market || 'N/A'}</td>
                    {/* Segment */}
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: segColor + '20', color: segColor }}
                      >
                        {segLabel}
                      </span>
                    </td>
                    {/* Visits */}
                    <td className="px-3 py-2.5 text-content-secondary">{m.total_visits ?? 0}</td>
                    {/* Last Visit */}
                    <td className="px-3 py-2.5">
                      {m.last_visit_date ? (
                        <span className="text-content-secondary">
                          {new Date(m.last_visit_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-red-500">Never</span>
                      )}
                    </td>
                    {/* Days to Renewal */}
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          m.days_to_renewal != null && m.days_to_renewal < 30
                            ? 'text-red-500 font-medium'
                            : 'text-content-secondary'
                        }
                      >
                        {m.days_to_renewal != null ? m.days_to_renewal : 'N/A'}
                      </span>
                    </td>
                    {/* Channel */}
                    <td className="px-3 py-2.5 text-content-secondary">{m.channel || 'N/A'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-content-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-secondary text-content-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Member detail panel */}
      {selectedMember && (
        <MemberDetailPanel
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
