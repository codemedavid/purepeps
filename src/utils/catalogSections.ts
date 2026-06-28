import type { Product } from '../types';
import type { Category } from '../hooks/useCategories';

/** Catalog identifier for the synthetic "All" pseudo-category, never a real section. */
const ALL_CATEGORY_ID = 'all';

/** Section id used to collect products whose category is missing or inactive. */
export const OTHER_SECTION_ID = '__other__';

/** A headed group of products rendered together in the catalog. */
export interface CatalogSection {
  /** Stable key — the category id, or {@link OTHER_SECTION_ID} for orphans. */
  id: string;
  /** The headline shown above the group. */
  headline: string;
  products: Product[];
}

/** Featured products float to the top of each section, then alphabetical by name. */
const sortByFeaturedThenName = (a: Product, b: Product): number => {
  if (a.featured && !b.featured) return -1;
  if (!a.featured && b.featured) return 1;
  return a.name.localeCompare(b.name);
};

/**
 * Group catalog products into headed sections by their category, ordered by each
 * category's configured `sort_order`. Empty categories are skipped. Products whose
 * category is unknown (deleted or inactive) are collected into a trailing "Other"
 * section so nothing silently disappears from the catalog.
 */
export function groupProductsIntoSections(
  products: Product[],
  categories: Category[],
): CatalogSection[] {
  const orderedCategories = categories
    .filter((category) => category.id !== ALL_CATEGORY_ID)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  const sections: CatalogSection[] = [];

  for (const category of orderedCategories) {
    const matches = products
      .filter((product) => product.category === category.id)
      .sort(sortByFeaturedThenName);

    if (matches.length > 0) {
      sections.push({ id: category.id, headline: category.name, products: matches });
    }
  }

  const knownIds = new Set(orderedCategories.map((category) => category.id));
  const orphans = products
    .filter((product) => !knownIds.has(product.category))
    .sort(sortByFeaturedThenName);

  if (orphans.length > 0) {
    sections.push({ id: OTHER_SECTION_ID, headline: 'Other', products: orphans });
  }

  return sections;
}
