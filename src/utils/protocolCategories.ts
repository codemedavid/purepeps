/**
 * Canonical categories for the Guides page's peptide protocols.
 *
 * `protocols.category` is a free-text column an admin types by hand, and the
 * dropdown used to be built straight from it — one option per DISTINCT STRING.
 * That is how the client ended up with "Weight Loss" listed twice after adding
 * it a second time with different spacing ("tigdadalawa lumabas").
 *
 * Everything here funnels that free text through one slug, so the dropdown is
 * keyed by meaning rather than by keystrokes. Nothing is ever discarded: a
 * category nobody anticipated still gets a slug and its own single option, it
 * just sorts after the canonical ones.
 *
 * Side-effect free (no React, no Supabase) so the rules the Guides page and the
 * admin Protocol manager both depend on can be unit tested on their own.
 */

/** The dropdown's unfiltered option. Not a real category, so never a slug. */
export const ALL_CATEGORIES_SLUG = 'all';

/**
 * Dosage text the older seed scripts wrote for rows that carried no real
 * protocol. A TEXT protocol still holding it has nothing to show, so the Guides
 * page hides it — see {@link isDisplayableProtocol}, which deliberately does
 * NOT apply that rule to file and image protocols.
 */
export const PLACEHOLDER_DOSAGE = 'Consult healthcare professional for dosing';

/** Separator that lets one protocol sit in several categories. */
const CATEGORY_SEPARATOR = ',';

export interface ProtocolCategory {
  slug: string;
  name: string;
}

export interface ProtocolCategoryOption extends ProtocolCategory {
  /** How many displayable protocols fall under it. */
  count: number;
}

/**
 * The categories the shop offers, in the order they appear in the dropdown.
 *
 * `aliases` exist for one job: fold labels ALREADY in the database onto the
 * canonical entry so old rows do not sit beside the new ones as near-duplicate
 * options. They are matched on the slug, so case and spacing are already
 * handled — only genuinely different WORDING belongs here.
 */
export const CANONICAL_PROTOCOL_CATEGORIES: readonly (ProtocolCategory & {
  aliases: readonly string[];
})[] = [
  {
    slug: 'weight-loss',
    name: 'Weight Loss',
    aliases: ['weight-management', 'weightloss', 'fat-loss', 'glp-1', 'glp1'],
  },
  {
    slug: 'fat-dissolvers',
    name: 'Fat Dissolvers',
    aliases: ['fat-dissolver', 'fat-dissolving', 'lipolytics', 'lipolysis'],
  },
  {
    slug: 'anti-aging',
    name: 'Anti Aging',
    aliases: ['antiaging', 'anti-ageing', 'skin-anti-aging', 'longevity'],
  },
  {
    slug: 'recovery-healing',
    name: 'Recovery Healing',
    aliases: ['recovery', 'healing', 'injury-repair', 'repair'],
  },
  {
    slug: 'muscle-performance',
    name: 'Muscle Performance',
    aliases: ['muscle', 'performance', 'growth-hormone', 'lean-mass'],
  },
  {
    slug: 'skin-hair',
    name: 'Skin Hair',
    aliases: ['skin', 'hair', 'skin-boosters', 'beauty'],
  },
  {
    slug: 'sleep-recovery',
    name: 'Sleep Recovery',
    aliases: ['sleep', 'rest'],
  },
  {
    slug: 'wellness-immunity',
    name: 'Wellness Immunity',
    aliases: ['wellness', 'immunity', 'immune'],
  },
];

/** slug (canonical or alias) → canonical category. Built once at module load. */
const BY_SLUG = new Map<string, ProtocolCategory>();
for (const category of CANONICAL_PROTOCOL_CATEGORIES) {
  const entry: ProtocolCategory = { slug: category.slug, name: category.name };
  BY_SLUG.set(category.slug, entry);
  for (const alias of category.aliases) BY_SLUG.set(alias, entry);
}

const CANONICAL_ORDER = new Map(
  CANONICAL_PROTOCOL_CATEGORIES.map((category, index) => [category.slug, index]),
);

/**
 * The one place free text becomes an identity.
 *
 * Lower-cases, drops anything that is not a letter, digit or space, collapses
 * runs of whitespace and hyphens to a single hyphen, then resolves aliases. So
 * "Weight Loss", "weight loss", "  WEIGHT   LOSS  ", "Weight-Loss" and
 * "Weight Management" are all `weight-loss` — one option, not five.
 */
export function toCategorySlug(raw: string | null | undefined): string {
  const slug = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-');

  if (slug === '') return '';
  return BY_SLUG.get(slug)?.slug ?? slug;
}

/** Title-cases a slug, for a category the canonical list has never seen. */
function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** The label shown for a slug: the canonical name, else a readable fallback. */
export function categoryDisplayName(slug: string): string {
  return BY_SLUG.get(slug)?.name ?? titleCase(slug);
}

/**
 * Every category one protocol belongs to.
 *
 * A comma list ("Weight Loss, Fat Dissolvers") puts one protocol under several
 * categories without a schema change, and repeats within the one field collapse
 * so a protocol is never counted twice under the same heading.
 */
export function parseProtocolCategories(raw: string | null | undefined): string[] {
  const slugs = (raw ?? '')
    .split(CATEGORY_SEPARATOR)
    .map(toCategorySlug)
    .filter((slug) => slug !== '');

  return [...new Set(slugs)];
}

/** The fields these rules read. Structural, so a full Protocol row satisfies it. */
export interface CategorizedProtocol {
  name: string;
  category: string;
  active: boolean;
  dosage: string;
  notes?: string[] | null;
  content_type?: 'text' | 'file' | 'image' | null;
  file_url?: string | null;
}

/**
 * Whether a protocol has anything to show a reader.
 *
 * The page used to test `dosage !== PLACEHOLDER_DOSAGE` for every row, which
 * quietly deleted file and image protocols: their dosing lives inside the
 * attachment, so the column is a placeholder BY DESIGN. That check is now
 * scoped to text protocols, and file/image rows are judged on whether a file is
 * actually attached.
 */
export function isDisplayableProtocol(protocol: CategorizedProtocol): boolean {
  if (!protocol.active) return false;

  if (protocol.content_type === 'file' || protocol.content_type === 'image') {
    return Boolean(protocol.file_url);
  }

  return protocol.dosage.trim() !== '' && protocol.dosage !== PLACEHOLDER_DOSAGE;
}

/**
 * The dropdown's options: the all-categories entry, then one entry per distinct
 * MEANING, canonical categories first and anything admin-invented after,
 * alphabetically. A category with no displayable protocol is not offered — an
 * option that can only ever produce an empty list is a dead end.
 */
export function protocolCategoryOptions(
  protocols: readonly CategorizedProtocol[],
): ProtocolCategoryOption[] {
  const displayable = protocols.filter(isDisplayableProtocol);
  const counts = new Map<string, number>();

  for (const protocol of displayable) {
    for (const slug of parseProtocolCategories(protocol.category)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  const options = [...counts.entries()]
    .map(([slug, count]) => ({ slug, name: categoryDisplayName(slug), count }))
    .sort((a, b) => {
      const rankA = CANONICAL_ORDER.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const rankB = CANONICAL_ORDER.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB || a.name.localeCompare(b.name);
    });

  return [
    { slug: ALL_CATEGORIES_SLUG, name: 'All Categories', count: displayable.length },
    ...options,
  ];
}

export interface ProtocolFilter {
  /** {@link ALL_CATEGORIES_SLUG} to skip the category narrowing. */
  categorySlug: string;
  /** Free text from the search box. Blank skips the text narrowing. */
  query: string;
}

/** Text a search matches against: the name, the categories and the notes. */
function searchableText(protocol: CategorizedProtocol): string {
  const categories = parseProtocolCategories(protocol.category).map(categoryDisplayName);
  return [protocol.name, protocol.category, ...categories, ...(protocol.notes ?? [])]
    .join(' ')
    .toLowerCase();
}

/**
 * The Guides list, narrowed by the dropdown AND the search box together.
 *
 * Both narrowings are optional and independent, so all-categories with an empty
 * query returns everything displayable — the state the page must never show an
 * empty message for.
 */
export function filterProtocols<T extends CategorizedProtocol>(
  protocols: readonly T[],
  { categorySlug, query }: ProtocolFilter,
): T[] {
  const needle = query.trim().toLowerCase();

  return protocols.filter((protocol) => {
    if (!isDisplayableProtocol(protocol)) return false;

    if (categorySlug !== ALL_CATEGORIES_SLUG) {
      if (!parseProtocolCategories(protocol.category).includes(categorySlug)) return false;
    }

    if (needle !== '' && !searchableText(protocol).includes(needle)) return false;

    return true;
  });
}
