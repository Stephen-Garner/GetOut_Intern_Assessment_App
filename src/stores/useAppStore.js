import { create } from 'zustand';
import { initTheme, setStoredTheme } from '../utils/theme.js';

const initialTheme = initTheme();

function createChatTab(id = `tab-${Date.now()}`) {
  return {
    id,
    label: 'New Chat',
    messages: [],
    isActive: true,
  };
}

function createPlaygroundThread(workspaceId, id = `playground-${Date.now()}`) {
  return {
    id,
    label: 'New Chat',
    messages: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    workspaceId,
  };
}

function upsertAttachments(existing, incoming) {
  const merged = [...existing];

  for (const attachment of incoming) {
    const index = merged.findIndex((item) => item.id === attachment.id || item.absolutePath === attachment.absolutePath);
    if (index === -1) {
      merged.push(attachment);
    } else {
      merged[index] = { ...merged[index], ...attachment };
    }
  }

  return merged;
}

const useAppStore = create((set, get) => ({
  // UI State
  activePageId: 'dashboard',
  dashboardTab: 'main',
  aiPanelOpen: false,
  theme: initialTheme,

  // Member filter
  memberFilter: null,

  // Toast notifications
  toast: null,

  // Workspace State
  activeWorkspaceId: null,
  workspaces: [],

  // Side AI Panel State
  claudeAvailable: false,
  chatTabs: [createChatTab('tab-1')],
  activeChatTabId: 'tab-1',

  // Dashboard Playground State
  playgroundMode: 'plan',
  playgroundThreads: [],
  activePlaygroundThreadId: null,

  // Global actions
  setActivePage: (pageId) => set({ activePageId: pageId }),
  setDashboardTab: (dashboardTab) => set({ dashboardTab }),
  setMemberFilter: (filter) => set({ memberFilter: filter }),
  showToast: (message) => set({ toast: message }),
  hideToast: () => set({ toast: null }),
  toggleAIPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),

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

  // Side AI panel actions
  addChatTab: () => {
    const id = `tab-${Date.now()}`;
    set((state) => ({
      chatTabs: [
        ...state.chatTabs.map((tab) => ({ ...tab, isActive: false })),
        createChatTab(id),
      ],
      activeChatTabId: id,
    }));
  },

  setActiveChatTab: (id) =>
    set((state) => ({
      chatTabs: state.chatTabs.map((tab) => ({ ...tab, isActive: tab.id === id })),
      activeChatTabId: id,
    })),

  closeChatTab: (id) =>
    set((state) => {
      const remaining = state.chatTabs.filter((tab) => tab.id !== id);

      if (remaining.length === 0) {
        const nextTab = createChatTab(`tab-${Date.now()}`);
        return { chatTabs: [nextTab], activeChatTabId: nextTab.id };
      }

      if (state.activeChatTabId === id) {
        const nextActive = remaining[remaining.length - 1];
        return {
          chatTabs: remaining.map((tab) => ({ ...tab, isActive: tab.id === nextActive.id })),
          activeChatTabId: nextActive.id,
        };
      }

      return { chatTabs: remaining };
    }),

  sendMessage: (tabId, content) =>
    set((state) => ({
      chatTabs: state.chatTabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const userMessage = {
          id: `msg-${Date.now()}`,
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          status: 'sent',
        };
        const messages = [...tab.messages, userMessage];
        const label = tab.messages.length === 0
          ? `${content.slice(0, 20)}${content.length > 20 ? '...' : ''}`
          : tab.label;

        return { ...tab, messages, label };
      }),
    })),

  addAssistantMessage: (tabId) => {
    const id = `msg-${Date.now()}-ai`;
    set((state) => ({
      chatTabs: state.chatTabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: [
            ...tab.messages,
            {
              id,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              status: 'streaming',
            },
          ],
        };
      }),
    }));
    return id;
  },

  appendToMessage: (tabId, messageId, text) =>
    set((state) => ({
      chatTabs: state.chatTabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: tab.messages.map((message) =>
            message.id === messageId
              ? { ...message, content: message.content + text }
              : message
          ),
        };
      }),
    })),

  finalizeMessage: (tabId, messageId, status) =>
    set((state) => ({
      chatTabs: state.chatTabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          messages: tab.messages.map((message) =>
            message.id === messageId
              ? { ...message, status: status || 'complete' }
              : message
          ),
        };
      }),
    })),

  // Playground actions
  setPlaygroundMode: (playgroundMode) => set({ playgroundMode }),

  ensurePlaygroundThread: (workspaceId) => {
    if (!workspaceId) return null;

    const currentState = get();
    const workspaceThreads = currentState.playgroundThreads.filter((thread) => thread.workspaceId === workspaceId);

    if (workspaceThreads.length > 0) {
      const activeForWorkspace = workspaceThreads.find((thread) => thread.id === currentState.activePlaygroundThreadId);
      const nextActiveId = activeForWorkspace ? activeForWorkspace.id : workspaceThreads[workspaceThreads.length - 1].id;
      if (nextActiveId !== currentState.activePlaygroundThreadId) {
        set({ activePlaygroundThreadId: nextActiveId });
      }
      return nextActiveId;
    }

    const thread = createPlaygroundThread(workspaceId);
    set((state) => ({
      playgroundThreads: [...state.playgroundThreads, thread],
      activePlaygroundThreadId: thread.id,
    }));

    return thread.id;
  },

  addPlaygroundThread: (workspaceId) => {
    if (!workspaceId) return null;

    const thread = createPlaygroundThread(workspaceId);
    set((state) => ({
      playgroundThreads: [...state.playgroundThreads, thread],
      activePlaygroundThreadId: thread.id,
    }));
    return thread.id;
  },

  setActivePlaygroundThread: (id) => set({ activePlaygroundThreadId: id }),

  closePlaygroundThread: (id) =>
    set((state) => {
      const closingThread = state.playgroundThreads.find((thread) => thread.id === id);
      const remaining = state.playgroundThreads.filter((thread) => thread.id !== id);

      if (!closingThread) {
        return {};
      }

      const sameWorkspaceThreads = remaining.filter((thread) => thread.workspaceId === closingThread.workspaceId);
      let nextThreads = remaining;
      let nextActiveId = state.activePlaygroundThreadId;

      if (sameWorkspaceThreads.length === 0) {
        const replacement = createPlaygroundThread(closingThread.workspaceId);
        nextThreads = [...remaining, replacement];
        nextActiveId = replacement.id;
      } else if (state.activePlaygroundThreadId === id) {
        nextActiveId = sameWorkspaceThreads[sameWorkspaceThreads.length - 1].id;
      }

      return {
        playgroundThreads: nextThreads,
        activePlaygroundThreadId: nextActiveId,
      };
    }),

  sendPlaygroundMessage: (threadId, content) =>
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;

        const userMessage = {
          id: `play-msg-${Date.now()}`,
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          status: 'sent',
        };
        const messages = [...thread.messages, userMessage];
        const label = thread.messages.length === 0
          ? `${content.slice(0, 24)}${content.length > 24 ? '...' : ''}`
          : thread.label;

        return { ...thread, messages, label };
      }),
    })),

  addPlaygroundAssistantMessage: (threadId) => {
    const id = `play-msg-${Date.now()}-ai`;
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          messages: [
            ...thread.messages,
            {
              id,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              status: 'streaming',
            },
          ],
        };
      }),
    }));
    return id;
  },

  appendToPlaygroundMessage: (threadId, messageId, text) =>
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId
              ? { ...message, content: message.content + text }
              : message
          ),
        };
      }),
    })),

  finalizePlaygroundMessage: (threadId, messageId, status) =>
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId
              ? { ...message, status: status || 'complete' }
              : message
          ),
        };
      }),
    })),

  setPlaygroundThreadAttachments: (threadId, attachments) =>
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          attachments: upsertAttachments(thread.attachments || [], attachments || []),
        };
      }),
    })),

  attachArtifactToPlaygroundMessage: (threadId, messageId, artifact) =>
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === messageId
              ? { ...message, artifact }
              : message
          ),
        };
      }),
    })),

  markPlaygroundArtifactSaved: (threadId, messageId, savedWidgetId) =>
    set((state) => ({
      playgroundThreads: state.playgroundThreads.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          messages: thread.messages.map((message) => {
            if (message.id !== messageId || !message.artifact) return message;
            return {
              ...message,
              artifact: {
                ...message.artifact,
                savedWidgetId,
              },
            };
          }),
        };
      }),
    })),
}));

export default useAppStore;
