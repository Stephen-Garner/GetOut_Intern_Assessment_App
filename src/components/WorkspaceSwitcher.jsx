import { useState, useRef, useEffect } from 'react';
import { Database, ChevronDown, Plus, Check, MoreHorizontal, Settings, FileText, Trash2 } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import { useWorkspace } from '../hooks/useWorkspace.js';

export default function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const ref = useRef(null);
  const { setActivePage } = useAppStore();
  const { workspaces, activeWorkspace, switchWorkspace, deleteWorkspace } = useWorkspace();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setMenuOpenId(null);
      }
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
        <div className="absolute left-3 right-3 top-full mt-1 bg-surface-secondary border border-border-primary rounded-lg shadow-lg overflow-visible z-50">
          {workspaces.length > 0 && (
            <div className="py-1">
              {workspaces.map((ws) => (
                <div key={ws.id} className="relative flex items-center group">
                  <button
                    onClick={() => {
                      switchWorkspace(ws.id);
                      setOpen(false);
                      setMenuOpenId(null);
                    }}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-content-secondary hover:bg-surface-tertiary transition-colors"
                  >
                    <span className="truncate flex-1 text-left">{ws.name}</span>
                    {activeWorkspace?.id === ws.id && <Check size={14} className="text-accent shrink-0" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === ws.id ? null : ws.id);
                    }}
                    className="shrink-0 p-1.5 mr-1 rounded text-content-muted hover:text-content-primary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {/* Context menu */}
                  {menuOpenId === ws.id && (
                    <div className="absolute right-0 top-full mt-0.5 w-48 bg-surface-primary border border-border-subtle rounded-lg shadow-xl z-[60] py-1">
                      <button
                        onClick={() => {
                          setActivePage('settings');
                          setOpen(false);
                          setMenuOpenId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-tertiary transition-colors"
                      >
                        <Settings size={12} />
                        <span>Edit settings</span>
                      </button>
                      <button
                        onClick={() => {
                          setActivePage('settings');
                          setOpen(false);
                          setMenuOpenId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-tertiary transition-colors"
                      >
                        <FileText size={12} />
                        <span>View files ({ws.dataSource?.files?.length || 0})</span>
                      </button>
                      <div className="border-t border-border-subtle my-1" />
                      <button
                        onClick={async () => {
                          await deleteWorkspace(ws.id);
                          setMenuOpenId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                      >
                        <Trash2 size={12} />
                        <span>Delete workspace</span>
                      </button>
                    </div>
                  )}
                </div>
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
