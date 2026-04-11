import { Radar, LayoutDashboard, Users, Zap, Settings, BotMessageSquare } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'interventions', label: 'Interventions', icon: Zap },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { activePageId, setActivePage, aiPanelOpen, toggleAIPanel } = useAppStore();

  return (
    <aside className="w-[220px] shrink-0 h-full flex flex-col bg-surface-secondary border-r border-border-primary">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
          <Radar size={18} className="text-accent" />
        </div>
        <span className="text-base font-semibold text-content-primary tracking-tight">Beacon</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activePageId === id;
          return (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-tertiary'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}

        <div className="pt-4">
          <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-content-muted">
            Data Source
          </p>
          <WorkspaceSwitcher />
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 flex items-center justify-between">
        <ThemeToggle compact />
        <button
          onClick={toggleAIPanel}
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
            aiPanelOpen
              ? 'bg-accent/10 text-accent'
              : 'text-content-secondary hover:text-content-primary hover:bg-surface-tertiary'
          }`}
          title="Toggle AI Panel"
        >
          <BotMessageSquare size={18} />
          <span className="text-xs font-medium">AI</span>
        </button>
      </div>
    </aside>
  );
}
