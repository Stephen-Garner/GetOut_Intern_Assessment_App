import { Sun, Moon } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useAppStore();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-2.5 py-2 rounded-md text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      {!compact && <span className="text-sm">{theme === 'dark' ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
