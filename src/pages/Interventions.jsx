import { Zap } from 'lucide-react';

export default function Interventions() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--danger)]/10 flex items-center justify-center">
          <Zap size={28} className="text-[var(--danger)]/50" />
        </div>
        <h2 className="text-lg font-semibold text-content-primary mb-2">Intervention Manager</h2>
        <p className="text-sm text-content-muted leading-relaxed">
          Create targeted activation campaigns for at-risk member segments. Coming in Phase 2.
        </p>
      </div>
    </div>
  );
}
