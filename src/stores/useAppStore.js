import { create } from 'zustand';
import { initTheme, setStoredTheme } from '../utils/theme.js';

const initialTheme = initTheme();

const useAppStore = create((set, get) => ({
  // UI State
  activePageId: 'dashboard',
  aiPanelOpen: false,
  theme: initialTheme,

  // Member filter (set by segment cards, consumed by Members page)
  memberFilter: null,

  // Toast notifications
  toast: null,

  // Workspace State
  activeWorkspaceId: null,
  workspaces: [],

  // AI Panel State
  claudeAvailable: false,
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
  setMemberFilter: (filter) => set({ memberFilter: filter }),
  showToast: (message) => set({ toast: message }),
  hideToast: () => set({ toast: null }),

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

  setClaudeAvailable: (available) => set({ claudeAvailable: available }),

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
    set((s) => ({
      chatTabs: s.chatTabs.map((t) => {
        if (t.id !== tabId) return t;
        const userMsg = { id: `msg-${Date.now()}`, role: 'user', content, timestamp: new Date().toISOString(), status: 'sent' };
        const messages = [...t.messages, userMsg];
        const label = t.messages.length === 0 ? content.slice(0, 20) + (content.length > 20 ? '...' : '') : t.label;
        return { ...t, messages, label };
      }),
    })),

  addAssistantMessage: (tabId) => {
    const id = `msg-${Date.now()}-ai`;
    set((s) => ({
      chatTabs: s.chatTabs.map((t) => {
        if (t.id !== tabId) return t;
        return { ...t, messages: [...t.messages, { id, role: 'assistant', content: '', timestamp: new Date().toISOString(), status: 'streaming' }] };
      }),
    }));
    return id;
  },

  appendToMessage: (tabId, msgId, text) =>
    set((s) => ({
      chatTabs: s.chatTabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...t,
          messages: t.messages.map((m) => m.id === msgId ? { ...m, content: m.content + text } : m),
        };
      }),
    })),

  finalizeMessage: (tabId, msgId, status) =>
    set((s) => ({
      chatTabs: s.chatTabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...t,
          messages: t.messages.map((m) => m.id === msgId ? { ...m, status: status || 'complete' } : m),
        };
      }),
    })),
}));

export default useAppStore;
