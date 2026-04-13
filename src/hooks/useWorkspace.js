import { useEffect, useCallback } from 'react';
import useAppStore from '../stores/useAppStore.js';
import { api } from '../utils/api.js';

export function useWorkspace() {
  const { activeWorkspaceId, workspaces, setActiveWorkspace, setWorkspaces } = useAppStore();

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.get('/workspaces');
      setWorkspaces(data);
      if (!activeWorkspaceId && data.length > 0) {
        setActiveWorkspace(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  }, [activeWorkspaceId, setActiveWorkspace, setWorkspaces]);

  const createWorkspace = useCallback(
    async (name, files) => {
      const data = await api.post('/workspaces', { name, files });
      await loadWorkspaces();
      setActiveWorkspace(data.id);
      return data;
    },
    [loadWorkspaces, setActiveWorkspace]
  );

  const deleteWorkspace = useCallback(
    async (id) => {
      await api.delete(`/workspaces/${id}`);
      if (activeWorkspaceId === id) {
        setActiveWorkspace(null);
      }
      await loadWorkspaces();
    },
    [activeWorkspaceId, loadWorkspaces, setActiveWorkspace]
  );

  const updateWorkspace = useCallback(
    async (id, updates) => {
      const data = await api.put(`/workspaces/${id}`, updates);
      await loadWorkspaces();
      return data;
    },
    [loadWorkspaces]
  );

  const reimportWorkspace = useCallback(
    async (id, name, files) => {
      const data = await api.put(`/workspaces/${id}/reimport`, { name, files });
      await loadWorkspaces();
      return data;
    },
    [loadWorkspaces]
  );

  const switchWorkspace = useCallback(
    (id) => {
      setActiveWorkspace(id);
    },
    [setActiveWorkspace]
  );

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    reimportWorkspace,
    deleteWorkspace,
    switchWorkspace,
  };
}
