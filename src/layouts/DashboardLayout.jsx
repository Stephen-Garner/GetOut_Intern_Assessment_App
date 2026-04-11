import Sidebar from '../components/Sidebar.jsx';
import AIPanel from '../components/AIPanel.jsx';
import useAppStore from '../stores/useAppStore.js';
import Dashboard from '../pages/Dashboard.jsx';
import Members from '../pages/Members.jsx';
import Interventions from '../pages/Interventions.jsx';
import Settings from '../pages/Settings.jsx';
import Simulator from '../pages/Simulator.jsx';

const pages = {
  dashboard: Dashboard,
  members: Members,
  interventions: Interventions,
  simulator: Simulator,
  settings: Settings,
};

export default function DashboardLayout() {
  const { activePageId } = useAppStore();
  const Page = pages[activePageId] || Dashboard;

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 min-w-[600px] overflow-y-auto bg-surface-primary panel-transition flex flex-col">
        {/* Drag region for window movement (Electron hiddenInset title bar) */}
        <div className="drag-region h-[38px] shrink-0" />
        <Page />
      </main>
      <AIPanel />
    </div>
  );
}
