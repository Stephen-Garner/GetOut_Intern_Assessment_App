import { useState, useRef } from 'react';
import { HelpCircle } from 'lucide-react';

const SCORE_RANGES = [
  { range: '0-25', label: 'Critical', color: '#EF4444', desc: 'High churn risk' },
  { range: '26-50', label: 'At Risk', color: '#F97316', desc: 'Needs intervention' },
  { range: '51-75', label: 'Healthy', color: '#EAB308', desc: 'On track to renew' },
  { range: '76-100', label: 'Strong', color: '#22C55E', desc: 'Likely to renew' },
];

export function getHealthColor(score) {
  if (score >= 76) return '#22C55E';
  if (score >= 51) return '#EAB308';
  if (score >= 26) return '#F97316';
  return '#EF4444';
}

export default function HealthScoreTooltip() {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  function handleEnter() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setShow(true);
  }

  return (
    <div className="inline-flex">
      <button
        ref={btnRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        className="text-content-muted hover:text-content-secondary transition-colors"
      >
        <HelpCircle size={14} />
      </button>
      {show && (
        <div
          className="fixed w-72 p-3 bg-surface-secondary border border-border-subtle rounded-lg shadow-xl z-[100] -translate-x-1/2"
          style={{ top: pos.top, left: pos.left, transform: `translate(-50%, -100%)` }}
        >
          <p className="text-xs font-semibold text-content-primary mb-2">Health Score (0-100)</p>
          <p className="text-xs text-content-muted mb-2">
            A composite measure of renewal likelihood based on:
          </p>
          <ul className="text-xs text-content-muted space-y-0.5 mb-3">
            <li>Visit frequency (40%)</li>
            <li>Visit recency (30%)</li>
            <li>Time utilization (20%)</li>
            <li>Renewal proximity (10%)</li>
          </ul>
          <div className="space-y-1">
            {SCORE_RANGES.map(r => (
              <div key={r.range} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-content-primary font-medium w-10">{r.range}</span>
                <span className="text-content-secondary">{r.label}</span>
                <span className="text-content-muted ml-auto">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
