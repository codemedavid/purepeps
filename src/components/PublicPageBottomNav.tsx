import React from 'react';
import { useNavigate } from 'react-router-dom';
import StorefrontBottomNav from './StorefrontBottomNav';
import { useFeatureFlagsContext } from '../contexts/FeatureFlagsContext';
import {
  STOREFRONT_PATH,
  storefrontNavigationOptions,
  type StorefrontRequest,
} from '../utils/storefrontNavigation';

/**
 * The bottom navigation as it appears on a standalone public page (Lab Reports,
 * Orders, Guides, FAQ, Calculator).
 *
 * Home and Shop are views owned by the storefront route, so here they route
 * back to the storefront carrying the view to open. The cart is not a tab: it
 * lives in the header beside the burger menu.
 */
const PublicPageBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { flags } = useFeatureFlagsContext();

  const goToStorefront = (request: StorefrontRequest) => {
    // pushState keeps the current scroll offset and nothing restores it, so
    // without this a tap from the bottom of a long page lands mid-storefront.
    // The route tabs reset scroll for the same reason.
    window.scrollTo({ top: 0, behavior: 'auto' });
    navigate(STOREFRONT_PATH, storefrontNavigationOptions(request));
  };

  return (
    <StorefrontBottomNav
      // No storefront view is on screen here, so the bar takes its active state
      // from the route; this is an inert placeholder.
      activeView="landing"
      showLabReports={flags.lab_reports}
      showOrders={flags.track_order}
      showGuides={flags.protocols}
      showReviews={flags.reviews}
      onHome={() => goToStorefront('home')}
      onShop={() => goToStorefront('shop')}
    />
  );
};

export default PublicPageBottomNav;
