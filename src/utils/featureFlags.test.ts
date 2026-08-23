import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_DEFINITIONS,
  FEATURE_IDS,
  FEATURE_SETTING_KEYS,
  featureFlagsFromRows,
  getFeatureDefinition,
  parseFeatureFlagValue,
  serializeFeatureFlagValue,
} from './featureFlags';

describe('feature definitions', () => {
  it('covers exactly the six admin-controlled features', () => {
    expect([...FEATURE_IDS]).toEqual([
      'products',
      'calculator',
      'protocols',
      'track_order',
      'faq',
      'lab_reports',
    ]);
  });

  it('gives every feature a distinct site_settings key', () => {
    const keys = FEATURE_DEFINITIONS.map((feature) => feature.settingKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FEATURE_SETTING_KEYS).toEqual(keys);
  });

  it('reuses the pre-existing coa_page_enabled key for Lab Reports', () => {
    // A previous build already stored this flag; adopting the key honours any
    // value an admin set before this feature existed.
    expect(getFeatureDefinition('lab_reports').settingKey).toBe('coa_page_enabled');
  });

  it('maps every route-backed feature to the path App.tsx registers', () => {
    expect(getFeatureDefinition('calculator').path).toBe('/calculator');
    expect(getFeatureDefinition('protocols').path).toBe('/protocols');
    expect(getFeatureDefinition('track_order').path).toBe('/track-order');
    expect(getFeatureDefinition('faq').path).toBe('/faq');
    expect(getFeatureDefinition('lab_reports').path).toBe('/coa');
  });

  it('leaves Products without a dedicated route because it is the storefront itself', () => {
    expect(getFeatureDefinition('products').path).toBeNull();
  });
});

describe('parseFeatureFlagValue', () => {
  it('treats the exact string "false" as off', () => {
    expect(parseFeatureFlagValue('false')).toBe(false);
  });

  it('treats "true" as on', () => {
    expect(parseFeatureFlagValue('true')).toBe(true);
  });

  it('fails open when the row is missing entirely', () => {
    // A fresh database has no seeded row yet; a feature must never vanish
    // just because nobody has flipped its switch.
    expect(parseFeatureFlagValue(undefined)).toBe(true);
    expect(parseFeatureFlagValue(null)).toBe(true);
  });

  it('fails open on an unrecognised value rather than hiding the feature', () => {
    expect(parseFeatureFlagValue('')).toBe(true);
    expect(parseFeatureFlagValue('nope')).toBe(true);
  });
});

describe('serializeFeatureFlagValue', () => {
  it('round-trips through parseFeatureFlagValue', () => {
    expect(parseFeatureFlagValue(serializeFeatureFlagValue(true))).toBe(true);
    expect(parseFeatureFlagValue(serializeFeatureFlagValue(false))).toBe(false);
  });

  it('stores booleans as the strings site_settings.value expects', () => {
    expect(serializeFeatureFlagValue(true)).toBe('true');
    expect(serializeFeatureFlagValue(false)).toBe('false');
  });
});

describe('DEFAULT_FEATURE_FLAGS', () => {
  it('enables every feature so a missing provider never hides the site', () => {
    expect(DEFAULT_FEATURE_FLAGS).toEqual({
      products: true,
      calculator: true,
      protocols: true,
      track_order: true,
      faq: true,
      lab_reports: true,
    });
  });
});

describe('featureFlagsFromRows', () => {
  it('maps stored rows onto their feature ids', () => {
    const flags = featureFlagsFromRows([
      { id: 'feature_faq_enabled', value: 'false' },
      { id: 'coa_page_enabled', value: 'false' },
    ]);

    expect(flags.faq).toBe(false);
    expect(flags.lab_reports).toBe(false);
  });

  it('leaves features without a row enabled', () => {
    const flags = featureFlagsFromRows([{ id: 'feature_faq_enabled', value: 'false' }]);

    expect(flags.products).toBe(true);
    expect(flags.calculator).toBe(true);
    expect(flags.protocols).toBe(true);
    expect(flags.track_order).toBe(true);
  });

  it('ignores unrelated site_settings rows', () => {
    const flags = featureFlagsFromRows([
      { id: 'site_name', value: 'false' },
      { id: 'access_requests_open', value: 'false' },
    ]);

    expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('returns all-enabled for an empty or absent row set', () => {
    expect(featureFlagsFromRows([])).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(featureFlagsFromRows(null)).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('does not mutate DEFAULT_FEATURE_FLAGS', () => {
    const flags = featureFlagsFromRows([{ id: 'feature_products_enabled', value: 'false' }]);

    expect(flags.products).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.products).toBe(true);
  });
});
