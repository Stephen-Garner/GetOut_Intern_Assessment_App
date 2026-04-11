import { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';

export default function Toast({ message, onClose, duration = 4000 }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-surface-secondary border border-border-subtle rounded-lg shadow-lg animate-slide-up">
      <CheckCircle size={18} className="text-[#22C55E] shrink-0" />
      <p className="text-sm text-content-primary">{message}</p>
      <button onClick={onClose} className="text-content-muted hover:text-content-primary shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}
