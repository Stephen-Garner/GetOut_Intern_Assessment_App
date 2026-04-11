import { useState, useRef, useEffect } from 'react';
import { Database, ChevronDown, Plus, Check } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';

export default function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { setActivePage } = useAppStore();
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative px-3 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-content-secondary hover:bg-surface-tertiary transition-colors"
      >
        <Database size={15} className="shrink-0 text-content-muted" />
        <span className="truncate flex-1 text-left">
          {activeWorkspace ? activeWorkspace.name : 'No data source'}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-surface-secondary border border-border-primary rounded-lg shadow-lg overflow-hidden z-50">
          {workspaces.length > 0 && (
            <div className="py-1">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    switchWorkspace(ws.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content-secondary hover:bg-surface-tertiary transition-colors"
                >
                  <span className="truncate flex-1 text-left">{ws.name}</span>
                  {activeWorkspace?.id === ws.id && <Check size={14} className="text-accent shrink-0" />}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-border-subtle">
            <button
              onClick={() => {
                setActivePage('settings');
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-surface-tertiary transition-colors"
            >
              <Plus size={14} />
              <span>Connect new data source</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
