/**
 * Group Buy landing page — every string, date and call-to-action the public
 * homepage renders.
 *
 * Stored as one `site_settings` row per field, exactly like the per-feature
 * visibility switches (see src/utils/featureFlags.ts). No new table, grant or
 * RLS policy is needed: `site_settings` is already anon-readable, admin-writable
 * via is_admin(), and in the `supabase_realtime` publication, so an admin's edit
 * reaches open tabs without a reload.
 *
 * Rules that keep the admin form predictable:
 *  - A row that is ABSENT falls back to the default below (fresh install).
 *  - A row that is PRESENT wins verbatim — including an empty string, which is
 *    how an admin removes an optional element (highlight, a stage's date, the
 *    secondary CTA).
 *  - A row holding an unknown enum value falls back rather than rendering
 *    something the page cannot honour.
 */

export const GB_STATUS_MODES = ['auto', 'open', 'closed'] as const;
export type GbStatusMode = (typeof GB_STATUS_MODES)[number];

/** The resolved badge state actually shown to a shopper. */
export type GbStatus = 'open' | 'closed';

/**
 * Where a CTA sends the shopper.
 *
 * Deliberately a closed whitelist rather than a free-text URL: these values end
 * up driving an in-app view switch or an internal route, and a stored string
 * pasted straight into an href would put `javascript:` and friends one admin
 * typo — or one compromised settings row — away from an XSS.
 */
export const GB_CTA_ACTIONS = [
  'catalog',
  'access',
  'cart',
  'track_order',
  'faq',
  'reviews',
  'none',
] as const;
export type GbCtaAction = (typeof GB_CTA_ACTIONS)[number];

/**
 * Stage icons, as keys into a fixed lucide-react lookup in the component.
 * Storing a name rather than letting the admin type one keeps the render a
 * table lookup instead of a dynamic import of an arbitrary identifier.
 */
export const GB_STAGE_ICONS = [
  'unlock',
  'timer',
  'send',
  'truck',
  'calendar',
  'package',
  'users',
  'sparkles',
] as const;
export type GbStageIcon = (typeof GB_STAGE_ICONS)[number];

export interface GbStage {
  icon: GbStageIcon;
  title: string;
  description: string;
  /**
   * Free-text display date, never parsed. An admin needs to be able to write
   * "Oct 10 - 18" or "ETA late Oct" as readily as "Sep 05".
   */
  date: string;
  /** Free-text time or ETA, e.g. "5:00 PM" or "Estimated". */
  time: string;
}

export type GbStages = readonly [GbStage, GbStage, GbStage, GbStage];

export interface GbLandingContent {
  statusMode: GbStatusMode;
  /** Badge prefix; the resolved open/closed word is appended by the component. */
  statusText: string;
  headline: string;
  /** Rendered in the accent colour after the headline. Blank omits it. */
  headlineHighlight: string;
  description: string;
  timelineTitle: string;
  stages: GbStages;
  /**
   * Shown INSTEAD of the timeline while the buy is closed. The stage dates
   * describe a buy that is running; between buys the useful thing to say is
   * when the next one starts, so the panel is swapped rather than stacked.
   */
  closedTitle: string;
  /** The "next GB is on ..." value. Free text; blank omits the line. */
  closedDate: string;
  closedMessage: string;
  primaryCtaLabel: string;
  primaryCtaAction: GbCtaAction;
  /** Blank label hides the secondary CTA entirely. */
  secondaryCtaLabel: string;
  secondaryCtaAction: GbCtaAction;
  bottomNote: string;
}

/** The `site_settings` columns this module reads and writes. */
export interface GbLandingSettingRow {
  id: string;
  value: string | null;
  type?: string;
  description?: string;
}

const KEY_PREFIX = 'gb_landing_';

/** Section-level fields, mapped to their `site_settings` primary keys. */
const KEY_BY_FIELD = {
  statusMode: `${KEY_PREFIX}status_mode`,
  statusText: `${KEY_PREFIX}status_text`,
  headline: `${KEY_PREFIX}headline`,
  headlineHighlight: `${KEY_PREFIX}headline_highlight`,
  description: `${KEY_PREFIX}description`,
  timelineTitle: `${KEY_PREFIX}timeline_title`,
  closedTitle: `${KEY_PREFIX}closed_title`,
  closedDate: `${KEY_PREFIX}closed_date`,
  closedMessage: `${KEY_PREFIX}closed_message`,
  primaryCtaLabel: `${KEY_PREFIX}cta_primary_label`,
  primaryCtaAction: `${KEY_PREFIX}cta_primary_action`,
  secondaryCtaLabel: `${KEY_PREFIX}cta_secondary_label`,
  secondaryCtaAction: `${KEY_PREFIX}cta_secondary_action`,
  bottomNote: `${KEY_PREFIX}bottom_note`,
} as const;

type GbLandingField = keyof typeof KEY_BY_FIELD;

/** Section-level fields whose value is stored and read back verbatim. */
const TEXT_FIELDS = [
  'statusText',
  'headline',
  'headlineHighlight',
  'description',
  'timelineTitle',
  'closedTitle',
  'closedDate',
  'closedMessage',
  'primaryCtaLabel',
  'secondaryCtaLabel',
  'bottomNote',
] as const satisfies readonly GbLandingField[];

export const GB_STAGE_COUNT = 4;

export const GB_STAGE_FIELDS = ['icon', 'title', 'description', 'date', 'time'] as const;
export type GbStageField = (typeof GB_STAGE_FIELDS)[number];

/** `site_settings` key for one stage field. `index` is zero-based. */
export const gbStageKey = (index: number, field: GbStageField): string =>
  `${KEY_PREFIX}stage${index + 1}_${field}`;

export const GB_STAGE_INDEXES: readonly number[] = Array.from(
  { length: GB_STAGE_COUNT },
  (_, index) => index,
);

export const GB_LANDING_KEYS: readonly string[] = [
  ...Object.values(KEY_BY_FIELD),
  ...GB_STAGE_INDEXES.flatMap((index) =>
    GB_STAGE_FIELDS.map((field) => gbStageKey(index, field)),
  ),
];

const defaultStage = (
  icon: GbStageIcon,
  title: string,
  description: string,
): GbStage => ({ icon, title, description, date: '', time: '' });

export const DEFAULT_GB_LANDING: GbLandingContent = {
  statusMode: 'auto',
  statusText: 'Group Buy',
  headline: 'Research peptides,',
  headlineHighlight: 'priced by the crowd.',
  description:
    'Third-party tested vials, at least 99% HPLC verified. Pool your order with the group and every vial gets cheaper as members commit.',
  timelineTitle: 'GB Timeline',
  closedTitle: 'Next Group Buy',
  // Batch-specific, so it starts blank rather than announcing an invented date.
  closedDate: '',
  closedMessage:
    'This group buy has closed. The next one opens soon — check back for the schedule.',
  stages: [
    defaultStage('unlock', 'GB Open', 'Ordering is live. Browse the catalog and reserve your vials.'),
    defaultStage('timer', 'Order Cut-off', 'Last call. Carts close and no new orders are accepted.'),
    defaultStage('send', 'Order Submission', 'The pooled order is placed with the supplier.'),
    defaultStage('truck', 'ETA / Shipping', 'Stock lands and ships out to members, cold-chain.'),
  ],
  primaryCtaLabel: 'Browse the Catalog',
  primaryCtaAction: 'catalog',
  secondaryCtaLabel: 'Get Access',
  secondaryCtaAction: 'access',
  bottomNote: 'The more members join, the lower the price!',
};

/**
 * Exact-match whitelist. Anything unrecognised becomes `fallback`, which is the
 * inert `none` unless a caller supplies the field's own default — so a stray
 * value can never turn into a navigation the page did not sanction.
 */
export const parseCtaAction = (
  value: string | null | undefined,
  fallback: GbCtaAction = 'none',
): GbCtaAction =>
  GB_CTA_ACTIONS.includes(value as GbCtaAction) ? (value as GbCtaAction) : fallback;

export const parseStageIcon = (
  value: string | null | undefined,
  fallback: GbStageIcon,
): GbStageIcon =>
  GB_STAGE_ICONS.includes(value as GbStageIcon) ? (value as GbStageIcon) : fallback;

const parseStatusMode = (value: string | null | undefined): GbStatusMode =>
  GB_STATUS_MODES.includes(value as GbStatusMode) ? (value as GbStatusMode) : 'auto';

/**
 * The badge state to render. `auto` follows the live batch so the badge can
 * never claim the buy is open while the server has ordering closed; the
 * explicit modes let an admin announce ahead of, or after, the batch itself.
 * An unrecognised stored mode is treated as `auto` for the same reason.
 */
export const resolveGbStatus = (mode: GbStatusMode, isBatchOpen: boolean): GbStatus => {
  if (mode === 'open') return 'open';
  if (mode === 'closed') return 'closed';
  return isBatchOpen ? 'open' : 'closed';
};

/** Builds the landing content from raw site_settings rows, filling gaps with defaults. */
export const gbLandingFromRows = (
  rows: readonly GbLandingSettingRow[] | null | undefined,
): GbLandingContent => {
  const byKey = new Map(
    (rows ?? [])
      .filter((row) => typeof row.value === 'string')
      .map((row) => [row.id, row.value as string]),
  );

  // `??` and not `||`: an empty string is a stored blank the admin chose.
  const read = (key: string, fallback: string): string => byKey.get(key) ?? fallback;

  const text = TEXT_FIELDS.reduce(
    (accumulated, field) => ({
      ...accumulated,
      [field]: read(KEY_BY_FIELD[field], DEFAULT_GB_LANDING[field]),
    }),
    {} as Pick<GbLandingContent, (typeof TEXT_FIELDS)[number]>,
  );

  const stages = GB_STAGE_INDEXES.map((index) => {
    const fallback = DEFAULT_GB_LANDING.stages[index];
    return {
      icon: parseStageIcon(byKey.get(gbStageKey(index, 'icon')), fallback.icon),
      title: read(gbStageKey(index, 'title'), fallback.title),
      description: read(gbStageKey(index, 'description'), fallback.description),
      date: read(gbStageKey(index, 'date'), fallback.date),
      time: read(gbStageKey(index, 'time'), fallback.time),
    };
  }) as unknown as GbStages;

  return {
    ...text,
    statusMode: parseStatusMode(byKey.get(KEY_BY_FIELD.statusMode)),
    primaryCtaAction: parseCtaAction(
      byKey.get(KEY_BY_FIELD.primaryCtaAction),
      DEFAULT_GB_LANDING.primaryCtaAction,
    ),
    secondaryCtaAction: parseCtaAction(
      byKey.get(KEY_BY_FIELD.secondaryCtaAction),
      DEFAULT_GB_LANDING.secondaryCtaAction,
    ),
    stages,
  };
};

const FIELD_LABEL: Record<GbLandingField, string> = {
  statusMode: 'status badge mode (auto follows the live batch)',
  statusText: 'status badge text',
  headline: 'main headline',
  headlineHighlight: 'highlighted headline text (blank hides it)',
  description: 'supporting description',
  timelineTitle: 'timeline section title',
  closedTitle: 'closed-state heading, shown instead of the timeline between buys',
  closedDate: 'closed-state date, e.g. the next buy\'s start. Blank hides the line',
  closedMessage: 'closed-state supporting text',
  primaryCtaLabel: 'primary CTA label',
  primaryCtaAction: 'primary CTA action',
  secondaryCtaLabel: 'secondary CTA label (blank hides the button)',
  secondaryCtaAction: 'secondary CTA action',
  bottomNote: 'bottom supporting text',
};

const STAGE_FIELD_LABEL: Record<GbStageField, string> = {
  icon: 'icon',
  title: 'title',
  description: 'description',
  date: 'date',
  time: 'time / ETA',
};

const describeRow = (detail: string): string => `Group Buy landing page - ${detail}.`;

/** Serialises the content into site_settings rows ready for an upsert. */
export const gbLandingToRows = (content: GbLandingContent): Required<GbLandingSettingRow>[] => [
  ...(Object.keys(KEY_BY_FIELD) as GbLandingField[]).map((field) => ({
    id: KEY_BY_FIELD[field],
    value: content[field],
    type: 'string',
    description: describeRow(FIELD_LABEL[field]),
  })),
  ...GB_STAGE_INDEXES.flatMap((index) =>
    GB_STAGE_FIELDS.map((field) => ({
      id: gbStageKey(index, field),
      value: content.stages[index][field],
      type: 'string',
      description: describeRow(`stage ${index + 1} ${STAGE_FIELD_LABEL[field]}`),
    })),
  ),
];
