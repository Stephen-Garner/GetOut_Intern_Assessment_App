// src/components/WidgetMenu.jsx
import { useEffect, useRef, useState } from 'react';
import { Code, MoreVertical, Pencil, Star, Trash2 } from 'lucide-react';

export default function WidgetMenu({ widget, onViewCode, onEditWithAI, onToggleStar, onDelete }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleItem(fn) {
    setOpen(false);
    fn?.();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
        title="Widget options"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border-subtle bg-surface-primary shadow-lg py-1 text-sm">
          <button
            onClick={() => handleItem(onViewCode)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <Code size={13} />
            View Code
          </button>
          <button
            onClick={() => handleItem(onEditWithAI)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <Pencil size={13} />
            Edit with AI
          </button>
          <button
            onClick={() => handleItem(onToggleStar)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-secondary transition-colors ${
              widget.starred ? 'text-yellow-500' : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            <Star size={13} fill={widget.starred ? 'currentColor' : 'none'} />
            {widget.starred ? 'Unstar' : 'Star'}
          </button>
          <div className="my-1 border-t border-border-subtle" />
          <button
            onClick={() => handleItem(onDelete)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-surface-secondary transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
