import { Users } from 'lucide-react';

export default function Members() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Users size={28} className="text-accent/50" />
        </div>
        <h2 className="text-lg font-semibold text-content-primary mb-2">Member Explorer</h2>
        <p className="text-sm text-content-muted leading-relaxed">
          Search, filter, and drill into individual member activation profiles. Coming in Phase 2.
        </p>
      </div>
    </div>
  );
}
