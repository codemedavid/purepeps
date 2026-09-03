/**
 * Per-feature visibility switches.
 *
 * Seven storefront features can be turned on or off individually from
 * Admin → Features. Each switch is ONE `site_settings` row, so turning a
 * feature off never touches the products, protocols, FAQs, COA reports or
 * orders behind it — flipping the switch back restores the feature intact.
 *
 * Rules that keep the storefront predictable:
 *  - A row that is ABSENT means ENABLED (fresh install, un-seeded database).
 *  - Only the exact string 'false' disables a feature. Anything else fails
 *    open, so a bad value or a read error can never blank the navigation.
 *
 * These flags drive UX only. They are not a security boundary: `site_settings`
 * is anon-readable, and nothing gated here exposes member-only data.
 */

export const FEATURE_IDS = [
  'products',
  'calculator',
  'protocols',
  'track_order',
  'faq',
  'lab_reports',
  'reviews',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Whether each feature is visible to customers. */
export type FeatureFlags = Record<FeatureId, boolean>;

export interface FeatureDefinition {
  id: FeatureId;
  /** Primary key of the backing `site_settings` row. */
  settingKey: string;
  /** Label shown both in the storefront nav and on the admin switch. */
  label: string;
  /** Admin-facing explanation of what turning this off hides. */
  description: string;
  /** Route this feature owns, or null when it has no dedicated page. */
  path: string | null;
}

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  {
    id: 'products',
    settingKey: 'feature_products_enabled',
    label: 'Products',
    // Products is the storefront catalog itself, not a separate page, so this
    // switch governs the navigation entry only. The catalog, cart and checkout
    // keep working regardless.
    path: null,
    description: 'Shows the Products link in the site navigation.',
  },
  {
    id: 'calculator',
    settingKey: 'feature_calculator_enabled',
    label: 'Calculator',
    path: '/calculator',
    description: 'The peptide reconstitution calculator page.',
  },
  {
    id: 'protocols',
    settingKey: 'feature_protocols_enabled',
    label: 'Protocols',
    path: '/protocols',
    description: 'The protocol guide page and its saved protocols.',
  },
  {
    id: 'track_order',
    settingKey: 'feature_track_order_enabled',
    label: 'Track Order',
    path: '/track-order',
    description: 'The order tracking page customers use to look up an order.',
  },
  {
    id: 'faq',
    settingKey: 'feature_faq_enabled',
    label: 'FAQ',
    path: '/faq',
    description: 'The frequently asked questions page.',
  },
  {
    id: 'lab_reports',
    // Deliberately NOT `feature_lab_reports_enabled`: an earlier build already
    // stored this flag under `coa_page_enabled`, so reusing the key honours any
    // value an admin set before these controls existed.
    settingKey: 'coa_page_enabled',
    label: 'Lab Reports',
    path: '/coa',
    description: 'The certificate-of-analysis / lab report page.',
  },
  {
    id: 'reviews',
    settingKey: 'feature_reviews_enabled',
    label: 'Customer Reviews',
    path: '/reviews',
    description:
      'The customer review page and its submission form. Turning this off hides ' +
      'published reviews without deleting them.',
  },
];

/**
 * Whether reviewers may attach photos.
 *
 * Deliberately NOT a `FeatureId`. The ids above each own a navigation entry and
 * a route; this one owns neither — it narrows what the review form accepts, and
 * `submit_product_review` enforces it server-side regardless of the client. It
 * is read on its own so switching photos off cannot take the review page down
 * with it.
 */
export const REVIEW_MEDIA_SETTING_KEY = 'feature_review_media_enabled';

export const FEATURE_SETTING_KEYS: readonly string[] = FEATURE_DEFINITIONS.map(
  (feature) => feature.settingKey,
);

const DEFINITIONS_BY_ID = new Map<FeatureId, FeatureDefinition>(
  FEATURE_DEFINITIONS.map((feature) => [feature.id, feature]),
);

const IDS_BY_SETTING_KEY = new Map<string, FeatureId>(
  FEATURE_DEFINITIONS.map((feature) => [feature.settingKey, feature.id]),
);

export function getFeatureDefinition(id: FeatureId): FeatureDefinition {
  const definition = DEFINITIONS_BY_ID.get(id);
  if (!definition) throw new Error(`Unknown feature id: ${id}`);
  return definition;
}

/** The value stored when a feature is switched OFF. Anything else means on. */
const DISABLED_VALUE = 'false';

/** Fail-open: only the exact string 'false' hides a feature. */
export function parseFeatureFlagValue(value: string | null | undefined): boolean {
  return value !== DISABLED_VALUE;
}

/** Inverse of {@link parseFeatureFlagValue}, for writing `site_settings.value`. */
export function serializeFeatureFlagValue(enabled: boolean): string {
  return enabled ? 'true' : DISABLED_VALUE;
}

/**
 * Every feature visible. Used before the settings load and whenever the read
 * fails, so a slow or unreachable database never empties the navigation.
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.freeze(
  Object.fromEntries(FEATURE_IDS.map((id) => [id, true])) as FeatureFlags,
);

/** The `site_settings` columns this module needs. */
export interface FeatureFlagRow {
  id: string;
  value: string | null;
}

/**
 * Projects `site_settings` rows onto the flag record. Unrelated rows are
 * ignored and features without a row stay enabled.
 */
export function featureFlagsFromRows(
  rows: readonly FeatureFlagRow[] | null | undefined,
): FeatureFlags {
  const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

  for (const row of rows ?? []) {
    const id = IDS_BY_SETTING_KEY.get(row.id);
    if (id) flags[id] = parseFeatureFlagValue(row.value);
  }

  return flags;
}
