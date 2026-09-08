import { describe, it, expect } from 'vitest';
import {
  ALL_CATEGORIES_SLUG,
  CANONICAL_PROTOCOL_CATEGORIES,
  categoryDisplayName,
  filterProtocols,
  isDisplayableProtocol,
  parseProtocolCategories,
  PLACEHOLDER_DOSAGE,
  protocolCategoryOptions,
  toCategorySlug,
  type CategorizedProtocol,
} from './protocolCategories';

function protocol(overrides: Partial<CategorizedProtocol> = {}): CategorizedProtocol {
  return {
    name: 'Tirzepatide',
    category: 'Weight Loss',
    active: true,
    dosage: '2.5mg',
    notes: [],
    content_type: 'text',
    file_url: null,
    ...overrides,
  };
}

describe('toCategorySlug', () => {
  it('collapses the case, spacing and punctuation an admin typed by hand', () => {
    // The client's own bug: they added "Weight Loss" twice and the dropdown
    // showed it twice ("tigdadalawa lumabas"). Every one of these is one thing.
    expect(toCategorySlug('Weight Loss')).toBe('weight-loss');
    expect(toCategorySlug('weight loss')).toBe('weight-loss');
    expect(toCategorySlug('  WEIGHT   LOSS  ')).toBe('weight-loss');
    expect(toCategorySlug('Weight-Loss')).toBe('weight-loss');
  });

  it('maps the display names the client asked for onto canonical slugs', () => {
    expect(toCategorySlug('Fat Dissolvers')).toBe('fat-dissolvers');
    expect(toCategorySlug('Anti Aging')).toBe('anti-aging');
    expect(toCategorySlug('Anti-Aging')).toBe('anti-aging');
  });

  it('folds known synonyms of a canonical category into it', () => {
    // Existing rows in the shop use these older labels. Left alone they would
    // sit beside the new ones as separate options, which is the duplication
    // this module exists to prevent.
    expect(toCategorySlug('Weight Management')).toBe('weight-loss');
    expect(toCategorySlug('Skin & Anti-Aging')).toBe('anti-aging');
  });

  it('keeps an unrecognised category rather than discarding it', () => {
    expect(toCategorySlug('Sleep & Cognition')).toBe('sleep-cognition');
  });

  it('returns an empty slug for blank input', () => {
    expect(toCategorySlug('')).toBe('');
    expect(toCategorySlug('   ')).toBe('');
    expect(toCategorySlug(null)).toBe('');
  });
});

describe('categoryDisplayName', () => {
  it('uses the canonical display name for a canonical slug', () => {
    expect(categoryDisplayName('weight-loss')).toBe('Weight Loss');
    expect(categoryDisplayName('fat-dissolvers')).toBe('Fat Dissolvers');
    expect(categoryDisplayName('anti-aging')).toBe('Anti Aging');
  });

  it('title-cases an unknown slug so it still reads as a label', () => {
    expect(categoryDisplayName('sleep-cognition')).toBe('Sleep Cognition');
  });
});

describe('parseProtocolCategories', () => {
  it('reads a single category as one slug', () => {
    expect(parseProtocolCategories('Weight Loss')).toEqual(['weight-loss']);
  });

  it('lets one protocol sit in several categories via a comma list', () => {
    expect(parseProtocolCategories('Weight Loss, Fat Dissolvers')).toEqual([
      'weight-loss',
      'fat-dissolvers',
    ]);
  });

  it('drops repeats within one protocol', () => {
    expect(parseProtocolCategories('Weight Loss, weight loss')).toEqual(['weight-loss']);
  });

  it('ignores blank segments from a trailing or doubled comma', () => {
    expect(parseProtocolCategories('Weight Loss,, ')).toEqual(['weight-loss']);
  });

  it('returns nothing for a missing category', () => {
    expect(parseProtocolCategories(null)).toEqual([]);
  });
});

describe('isDisplayableProtocol', () => {
  it('hides an inactive protocol', () => {
    expect(isDisplayableProtocol(protocol({ active: false }))).toBe(false);
  });

  it('hides a text protocol that still carries the placeholder dosage', () => {
    expect(isDisplayableProtocol(protocol({ dosage: PLACEHOLDER_DOSAGE }))).toBe(false);
  });

  it('shows a file protocol even though it has no dosing text', () => {
    // A PDF or image protocol carries its dosing INSIDE the file, so judging it
    // by the dosage column hid real content — one of the reasons the page read
    // "0 protocol(s) found".
    expect(
      isDisplayableProtocol(
        protocol({ dosage: PLACEHOLDER_DOSAGE, content_type: 'file', file_url: 'a.pdf' }),
      ),
    ).toBe(true);
    expect(
      isDisplayableProtocol(protocol({ dosage: '', content_type: 'image', file_url: 'a.png' })),
    ).toBe(true);
  });

  it('hides a file protocol with no file attached', () => {
    expect(
      isDisplayableProtocol(protocol({ content_type: 'file', file_url: null, dosage: '' })),
    ).toBe(false);
  });
});

describe('protocolCategoryOptions', () => {
  it('lists each category exactly once, however the admin spelled it', () => {
    const options = protocolCategoryOptions([
      protocol({ name: 'Tirzepatide', category: 'Weight Loss' }),
      protocol({ name: 'Retatrutide', category: 'weight loss' }),
      protocol({ name: 'Semaglutide', category: '  Weight   Loss ' }),
    ]);

    const weightLoss = options.filter((option) => option.slug === 'weight-loss');
    expect(weightLoss).toHaveLength(1);
    expect(weightLoss[0].name).toBe('Weight Loss');
  });

  it('leads with the all-categories option', () => {
    const options = protocolCategoryOptions([protocol()]);

    expect(options[0].slug).toBe(ALL_CATEGORIES_SLUG);
  });

  it('counts every protocol in a category, including multi-category ones', () => {
    const options = protocolCategoryOptions([
      protocol({ name: 'Tirzepatide', category: 'Weight Loss, Fat Dissolvers' }),
      protocol({ name: 'Lipo-C', category: 'Fat Dissolvers' }),
    ]);

    const bySlug = Object.fromEntries(options.map((option) => [option.slug, option.count]));
    expect(bySlug['weight-loss']).toBe(1);
    expect(bySlug['fat-dissolvers']).toBe(2);
    expect(bySlug[ALL_CATEGORIES_SLUG]).toBe(2);
  });

  it('omits protocols that are not displayable', () => {
    const options = protocolCategoryOptions([
      protocol({ category: 'Weight Loss' }),
      protocol({ category: 'Fat Dissolvers', active: false }),
    ]);

    expect(options.map((option) => option.slug)).not.toContain('fat-dissolvers');
  });

  it('orders canonical categories first, then anything the admin invented', () => {
    const options = protocolCategoryOptions([
      protocol({ category: 'Zebra Peptides' }),
      protocol({ category: 'Anti Aging' }),
      protocol({ category: 'Weight Loss' }),
    ]);

    expect(options.map((option) => option.slug)).toEqual([
      ALL_CATEGORIES_SLUG,
      'weight-loss',
      'anti-aging',
      'zebra-peptides',
    ]);
  });
});

describe('filterProtocols', () => {
  const catalog = [
    protocol({
      name: 'Tirzepatide',
      category: 'Weight Loss',
      notes: ['Titrate slowly from 2.5mg'],
    }),
    protocol({ name: 'Lipo-C', category: 'Fat Dissolvers', notes: [] }),
    protocol({ name: 'GHK-Cu', category: 'Anti Aging', notes: ['Skin remodelling'] }),
    protocol({ name: 'Hidden', category: 'Weight Loss', active: false }),
  ];

  it('returns every displayable protocol for all-categories with no query', () => {
    const found = filterProtocols(catalog, { categorySlug: ALL_CATEGORIES_SLUG, query: '' });

    expect(found.map((p) => p.name)).toEqual(['Tirzepatide', 'Lipo-C', 'GHK-Cu']);
  });

  it('narrows to one category', () => {
    const found = filterProtocols(catalog, { categorySlug: 'fat-dissolvers', query: '' });

    expect(found.map((p) => p.name)).toEqual(['Lipo-C']);
  });

  it('finds a protocol by name regardless of case', () => {
    const found = filterProtocols(catalog, { categorySlug: ALL_CATEGORIES_SLUG, query: 'ghk' });

    expect(found.map((p) => p.name)).toEqual(['GHK-Cu']);
  });

  it('finds a protocol by its category name', () => {
    const found = filterProtocols(catalog, {
      categorySlug: ALL_CATEGORIES_SLUG,
      query: 'fat dissolv',
    });

    expect(found.map((p) => p.name)).toEqual(['Lipo-C']);
  });

  it('finds a protocol by a word in its notes', () => {
    const found = filterProtocols(catalog, {
      categorySlug: ALL_CATEGORIES_SLUG,
      query: 'titrate',
    });

    expect(found.map((p) => p.name)).toEqual(['Tirzepatide']);
  });

  it('combines the category and the search box', () => {
    const found = filterProtocols(catalog, { categorySlug: 'weight-loss', query: 'ghk' });

    expect(found).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    const found = filterProtocols(catalog, {
      categorySlug: ALL_CATEGORIES_SLUG,
      query: '   lipo   ',
    });

    expect(found.map((p) => p.name)).toEqual(['Lipo-C']);
  });

  it('keeps a multi-category protocol visible under each of its categories', () => {
    const both = [protocol({ name: 'Tirzepatide', category: 'Weight Loss, Fat Dissolvers' })];

    expect(filterProtocols(both, { categorySlug: 'weight-loss', query: '' })).toHaveLength(1);
    expect(filterProtocols(both, { categorySlug: 'fat-dissolvers', query: '' })).toHaveLength(1);
  });
});

describe('CANONICAL_PROTOCOL_CATEGORIES', () => {
  it('contains the three the client named, spelled as they asked', () => {
    const names = CANONICAL_PROTOCOL_CATEGORIES.map((category) => category.name);

    expect(names).toContain('Weight Loss');
    expect(names).toContain('Fat Dissolvers');
    expect(names).toContain('Anti Aging');
  });

  it('has no duplicate slug, so the dropdown cannot repeat itself', () => {
    const slugs = CANONICAL_PROTOCOL_CATEGORIES.map((category) => category.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has a name that slugs back to its own slug', () => {
    for (const category of CANONICAL_PROTOCOL_CATEGORIES) {
      expect(toCategorySlug(category.name)).toBe(category.slug);
    }
  });
});
