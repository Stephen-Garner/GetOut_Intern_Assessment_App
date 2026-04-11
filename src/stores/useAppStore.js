import { create } from 'zustand';
import { initTheme, setStoredTheme } from '../utils/theme.js';

const initialTheme = initTheme();

const useAppStore = create((set, get) => ({
  // UI State
  activePageId: 'dashboard',
  aiPanelOpen: false,
  theme: initialTheme,

  // Workspace State
  activeWorkspaceId: null,
  workspaces: [],

  // AI Panel State
  chatTabs: [
    {
      id: 'tab-1',
      label: 'New Chat',
      messages: [],
      isActive: true,
    },
  ],
  activeChatTabId: 'tab-1',

  // Actions
  setActivePage: (pageId) => set({ activePageId: pageId }),

  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),

  setTheme: (theme) => {
    setStoredTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    setStoredTheme(next);
    set({ theme: next });
  },

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  setWorkspaces: (workspaces) => set({ workspaces }),

  addChatTab: () => {
    const id = `tab-${Date.now()}`;
    set((s) => ({
      chatTabs: [
        ...s.chatTabs.map((t) => ({ ...t, isActive: false })),
        { id, label: 'New Chat', messages: [], isActive: true },
      ],
      activeChatTabId: id,
    }));
  },

  setActiveChatTab: (id) =>
    set((s) => ({
      chatTabs: s.chatTabs.map((t) => ({ ...t, isActive: t.id === id })),
      activeChatTabId: id,
    })),

  closeChatTab: (id) =>
    set((s) => {
      const remaining = s.chatTabs.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        const newTab = { id: `tab-${Date.now()}`, label: 'New Chat', messages: [], isActive: true };
        return { chatTabs: [newTab], activeChatTabId: newTab.id };
      }
      const needsNewActive = s.activeChatTabId === id;
      if (needsNewActive) {
        remaining[remaining.length - 1].isActive = true;
        return { chatTabs: remaining, activeChatTabId: remaining[remaining.length - 1].id };
      }
      return { chatTabs: remaining };
    }),

  sendMessage: (tabId, content) =>
    set((s) => {
      const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
      const assistantMsg = {
        role: 'assistant',
        content:
          'Claude Code integration will be connected in Phase 3. This panel will let you ask questions about your data and build custom widgets.',
        timestamp: new Date().toISOString(),
      };

      return {
        chatTabs: s.chatTabs.map((t) => {
          if (t.id !== tabId) return t;
          const messages = [...t.messages, userMsg, assistantMsg];
          const label = t.messages.length === 0 ? content.slice(0, 28) + (content.length > 28 ? '...' : '') : t.label;
          return { ...t, messages, label };
        }),
      };
    }),
}));

export default useAppStore;
