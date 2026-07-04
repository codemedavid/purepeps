import { describe, it, expect } from 'vitest';
import { groupProductsIntoSections, OTHER_SECTION_ID } from './catalogSections';
import type { Product } from '../types';
import type { Category } from '../hooks/useCategories';

const category = (id: string, name: string, sort_order: number, is_free = false): Category => ({
  id,
  name,
  icon: 'Grid',
  sort_order,
  active: true,
  is_free,
  created_at: '1970-01-01T00:00:00.000Z',
  updated_at: '1970-01-01T00:00:00.000Z',
});

const product = (overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>): Product => ({
  description: '',
  base_price: 0,
  discount_price: null,
  discount_start_date: null,
  discount_end_date: null,
  discount_active: false,
  purity_percentage: 99,
  molecular_weight: null,
  cas_number: null,
  sequence: null,
  storage_conditions: '',
  inclusions: null,
  stock_quantity: 0,
  available: true,
  featured: false,
  image_url: null,
  safety_sheet_url: null,
  created_at: '1970-01-01T00:00:00.000Z',
  updated_at: '1970-01-01T00:00:00.000Z',
  ...overrides,
});

const categories: Category[] = [
  category('all', 'All Peptides', 0),
  category('research', 'Growth & Hormones', 1),
  category('cosmetic', 'Anti-Aging & Skin', 2),
];

describe('groupProductsIntoSections', () => {
  it('groups products under their category headline', () => {
    const products = [
      product({ id: '1', name: 'BPC-157', category: 'research' }),
      product({ id: '2', name: 'GHK-Cu', category: 'cosmetic' }),
    ];

    const sections = groupProductsIntoSections(products, categories);

    expect(sections.map((s) => s.headline)).toEqual(['Growth & Hormones', 'Anti-Aging & Skin']);
    expect(sections[0].products.map((p) => p.id)).toEqual(['1']);
    expect(sections[1].products.map((p) => p.id)).toEqual(['2']);
  });

  it('orders sections by category sort_order, not insertion order', () => {
    const products = [
      product({ id: '1', name: 'GHK-Cu', category: 'cosmetic' }),
      product({ id: '2', name: 'BPC-157', category: 'research' }),
    ];

    const sections = groupProductsIntoSections(products, categories);

    expect(sections.map((s) => s.id)).toEqual(['research', 'cosmetic']);
  });

  it('skips categories that have no products', () => {
    const products = [product({ id: '1', name: 'BPC-157', category: 'research' })];

    const sections = groupProductsIntoSections(products, categories);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('research');
  });

  it('floats featured products to the top of a section, then sorts by name', () => {
    const products = [
      product({ id: '1', name: 'Zeta', category: 'research' }),
      product({ id: '2', name: 'Alpha', category: 'research' }),
      product({ id: '3', name: 'Mu', category: 'research', featured: true }),
    ];

    const sections = groupProductsIntoSections(products, categories);

    expect(sections[0].products.map((p) => p.name)).toEqual(['Mu', 'Alpha', 'Zeta']);
  });

  it('collects products with unknown categories into a trailing Other section', () => {
    const products = [
      product({ id: '1', name: 'BPC-157', category: 'research' }),
      product({ id: '2', name: 'Mystery', category: 'deleted-cat' }),
    ];

    const sections = groupProductsIntoSections(products, categories);

    const last = sections[sections.length - 1];
    expect(last.id).toBe(OTHER_SECTION_ID);
    expect(last.headline).toBe('Other');
    expect(last.products.map((p) => p.id)).toEqual(['2']);
  });

  it('returns an empty array when there are no products', () => {
    expect(groupProductsIntoSections([], categories)).toEqual([]);
  });

  describe('accessible-first ordering (prioritize available access)', () => {
    const products = [
      product({ id: '1', name: 'BPC-157', category: 'research' }),
      product({ id: '2', name: 'GHK-Cu', category: 'cosmetic' }),
    ];

    it('floats categories the shopper can order above locked ones', () => {
      // Unverified shopper: only 'cosmetic' is accessible (e.g. a free category).
      const canAccess = (id: string | null | undefined) => id === 'cosmetic';

      const sections = groupProductsIntoSections(products, categories, canAccess);

      expect(sections.map((s) => s.id)).toEqual(['cosmetic', 'research']);
    });

    it('keeps sort_order as the tie-breaker among accessible categories', () => {
      const cats: Category[] = [
        category('all', 'All Peptides', 0),
        category('free-late', 'Free Late', 5, true),
        category('free-early', 'Free Early', 1, true),
        category('gated', 'Gated', 3),
      ];
      const prods = [
        product({ id: 'a', name: 'A', category: 'free-late' }),
        product({ id: 'b', name: 'B', category: 'free-early' }),
        product({ id: 'c', name: 'C', category: 'gated' }),
      ];
      const canAccess = (id: string | null | undefined) => id?.startsWith('free') ?? false;

      const sections = groupProductsIntoSections(prods, cats, canAccess);

      expect(sections.map((s) => s.id)).toEqual(['free-early', 'free-late', 'gated']);
    });

    it('preserves sort_order when no predicate is supplied', () => {
      const sections = groupProductsIntoSections(products, categories);
      expect(sections.map((s) => s.id)).toEqual(['research', 'cosmetic']);
    });
  });
});
