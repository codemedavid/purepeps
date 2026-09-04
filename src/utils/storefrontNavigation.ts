/**
 * Routes reachable from the storefront bottom navigation, plus the contract a
 * standalone public page uses to hand navigation back to the storefront.
 *
 * The bottom bar renders on every public page, but the storefront's Home / Shop
 * / Cart destinations are local views owned by `MainApp` rather than routes. A
 * page like Lab Reports therefore navigates to the storefront route carrying a
 * request for the view to open on arrival.
 */

export const STOREFRONT_PATH = '/';
export const LAB_REPORTS_PATH = '/coa';
export const ORDERS_PATH = '/track-order';
export const GUIDES_PATH = '/protocols';

/** Which storefront view to open once the storefront route takes over. */
export type StorefrontRequest = 'home' | 'shop' | 'cart';

export interface StorefrontLocationState {
  storefront?: StorefrontRequest;
}

const STOREFRONT_REQUESTS: readonly StorefrontRequest[] = ['home', 'shop', 'cart'];

/** Router options that carry `request` to the storefront route. */
export const storefrontNavigationOptions = (
  request: StorefrontRequest,
): { state: StorefrontLocationState } => ({ state: { storefront: request } });

/**
 * Read a storefront request out of router location state. History state is a
 * boundary — it survives reloads and can be rewritten by hand — so anything
 * that isn't a known request is discarded rather than trusted.
 */
export const readStorefrontRequest = (state: unknown): StorefrontRequest | null => {
  if (!state || typeof state !== 'object') return null;

  const requested = (state as StorefrontLocationState).storefront;
  return STOREFRONT_REQUESTS.includes(requested as StorefrontRequest)
    ? (requested as StorefrontRequest)
    : null;
};

/**
 * Bottom padding that keeps the fixed mobile bottom navigation from covering the
 * end of a page. Applied to each public page's own root — rather than to a
 * wrapper around it — so the page's background extends behind the clearance
 * instead of leaving a strip of body colour above the bar.
 */
export const BOTTOM_NAV_CLEARANCE = 'pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0';
