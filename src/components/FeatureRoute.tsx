import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureFlagsContext } from '../contexts/FeatureFlagsContext';
import type { FeatureId } from '../utils/featureFlags';
import LoadingSpinner from './LoadingSpinner';

interface FeatureRouteProps {
  /** The switch that governs this route. */
  feature: FeatureId;
  children: ReactNode;
}

/**
 * Makes a route unreachable while its feature is switched off, redirecting to
 * the storefront so the page simply reads as not existing.
 *
 * Never redirects while the flags are still loading: on a cold load the setting
 * has not been read yet, and bouncing on an unresolved flag would throw every
 * visitor off a page that is in fact enabled.
 */
export default function FeatureRoute({ feature, children }: FeatureRouteProps) {
  const { flags, loading } = useFeatureFlagsContext();

  if (loading) return <LoadingSpinner />;
  if (!flags[feature]) return <Navigate to="/" replace />;

  return <>{children}</>;
}
