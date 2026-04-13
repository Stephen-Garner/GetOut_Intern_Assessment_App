import { useEffect } from 'react';
import useAppStore from '../stores/useAppStore.js';
import { normalizeClaudeAvailability } from '../utils/playground.js';

export default function useClaudeAvailability() {
  const setClaudeAvailable = useAppStore((state) => state.setClaudeAvailable);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailability() {
      try {
        let available = false;

        if (window.beacon?.isElectron) {
          available = normalizeClaudeAvailability(await window.beacon.checkClaude());
        } else {
          const response = await fetch('/api/chat/status');
          const payload = await response.json();
          available = normalizeClaudeAvailability(payload);
        }

        if (!cancelled) {
          setClaudeAvailable(available);
        }
      } catch {
        if (!cancelled) {
          setClaudeAvailable(false);
        }
      }
    }

    loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [setClaudeAvailable]);
}
