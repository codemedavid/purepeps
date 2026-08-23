import { createContext, useContext, type ReactNode } from 'react';
import { useFeatureFlags, type FeatureFlagsState } from '../hooks/useFeatureFlags';
import { DEFAULT_FEATURE_FLAGS } from '../utils/featureFlags';

const FeatureFlagsContext = createContext<FeatureFlagsState | null>(null);

/**
 * Fallback for trees rendered outside the provider (isolated component tests,
 * and any surface mounted before the provider exists). Deliberately different
 * from `AccessContext`, which throws: a missing provider here must never hide
 * navigation, so it reports every feature enabled and already resolved.
 */
const ALL_FEATURES_ENABLED: FeatureFlagsState = {
  flags: DEFAULT_FEATURE_FLAGS,
  loading: false,
  error: null,
  setFeatureEnabled: async () => {},
  refetch: async () => {},
};

/**
 * One read and one Realtime subscription for the whole app. Mounted above the
 * routes so the header, footer and route guards all agree on what is visible.
 */
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const features = useFeatureFlags();
  return <FeatureFlagsContext.Provider value={features}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlagsContext(): FeatureFlagsState {
  return useContext(FeatureFlagsContext) ?? ALL_FEATURES_ENABLED;
}
