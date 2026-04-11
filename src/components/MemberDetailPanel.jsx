import { X, Calendar, MapPin, Activity, Clock } from 'lucide-react';

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

const INTERVENTIONS = {
  ghost: 'Trigger First Use Fast campaign. Send venue recommendations nearby.',
  one_and_done: 'Send personalized follow-up. Suggest 3 alternative venues.',
  approaching_threshold: 'Nudge toward 4th visit. Frame as value inflection point.',
  in_the_zone: 'Pre-renewal value recap. Highlight savings and new venues.',
  power_user: 'Activate referral program. Collect feedback on venue additions.',
  new_member: 'Monitor. Will enter First Use Fast sequence if no visit within 14 days.',
};

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function HealthCircle({ score }) {
  const size = 80;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? '#22C55E' : score >= 30 ? '#EAB308' : '#EF4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border-subtle"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-bold text-content-primary">{score}</span>
    </div>
  );
}

export default function MemberDetailPanel({ member, onClose }) {
  if (!member) return null;

  const segment = member._segment;
  const segColor = SEGMENT_COLORS[segment] || '#6B7280';
  const segLabel = SEGMENT_LABELS[segment] || segment;
  const daysAsMember = daysSince(member.purchase_date);
  const daysSinceLastVisit = daysSince(member.last_visit_date);
  const daysToRenewal = member.days_to_renewal;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[420px] max-w-full bg-surface-primary border-l border-border-subtle shadow-2xl z-50 overflow-y-auto transition-transform duration-300">
        {/* Header */}
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-content-primary truncate">
                {member.first_name} {member.last_name}
              </h2>
              <p className="text-sm text-content-muted truncate mt-0.5">{member.email}</p>
              <span
                className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: segColor + '20', color: segColor }}
              >
                {segLabel}
              </span>
            </div>
            <div className="flex items-start gap-4 ml-4">
              <HealthCircle score={member._health_score ?? 0} />
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-surface-tertiary text-content-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3 p-6">
          <StatCard
            icon={<Calendar size={14} />}
            label="Days as member"
            value={daysAsMember != null ? daysAsMember : 'N/A'}
          />
          <StatCard
            icon={<Activity size={14} />}
            label="Total visits"
            value={member.total_visits ?? 0}
          />
          <StatCard
            icon={<Clock size={14} />}
            label="Days since last visit"
            value={daysSinceLastVisit != null ? daysSinceLastVisit : 'Never'}
            valueClass={
              daysSinceLastVisit == null
                ? 'text-red-500'
                : daysSinceLastVisit > 45
                  ? 'text-red-500'
                  : ''
            }
          />
          <StatCard
            icon={<MapPin size={14} />}
            label="Days to renewal"
            value={daysToRenewal != null ? daysToRenewal : 'N/A'}
            valueClass={daysToRenewal != null && daysToRenewal < 30 ? 'text-red-500' : ''}
          />
        </div>

        {/* Intervention */}
        <div className="px-6 pb-6">
          <div className="rounded-lg border border-border-subtle bg-surface-secondary p-4">
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
              Recommended Intervention
            </h3>
            <p className="text-sm text-content-primary leading-relaxed">
              {INTERVENTIONS[segment] || 'No recommendation available.'}
            </p>
          </div>
        </div>

        {/* Additional info */}
        <div className="px-6 pb-6">
          <div className="space-y-3">
            <InfoRow label="Market" value={member.home_market} />
            <InfoRow label="Channel" value={member.channel} />
            <InfoRow label="Purchase date" value={member.purchase_date ? new Date(member.purchase_date).toLocaleDateString() : 'N/A'} />
            <InfoRow label="Renewal date" value={member.renewal_date ? new Date(member.renewal_date).toLocaleDateString() : 'N/A'} />
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, label, value, valueClass = '' }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-secondary p-3">
      <div className="flex items-center gap-1.5 text-content-muted mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-semibold text-content-primary ${valueClass}`}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-content-muted">{label}</span>
      <span className="text-content-primary font-medium">{value || 'N/A'}</span>
    </div>
  );
}
