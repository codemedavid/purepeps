import { useEffect, useSyncExternalStore } from 'react';
import type { ResourceState, SharedResource } from '../lib/sharedResource';

/**
 * Subscribe a component to a shared cached resource. The component re-renders on
 * state changes and triggers a one-time load on mount (cached loads resolve
 * instantly, so remounting shows data immediately with no loading flash).
 */
export function useSharedResource<T>(resource: SharedResource<T>): ResourceState<T> {
  const state = useSyncExternalStore(resource.subscribe, resource.getState, resource.getState);

  useEffect(() => {
    resource.ensureLoaded();
  }, [resource]);

  return state;
}
