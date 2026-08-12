/**
 * Storefront "Important Notice" — the acknowledgement modal shown on every visit
 * to the storefront. Every field is admin-editable and lives in `site_settings`
 * as one row per field, so no new table or RLS policy is needed.
 *
 * Rules that keep the admin form predictable:
 *  - A row that is ABSENT falls back to the default below (fresh install).
 *  - A row that is PRESENT wins verbatim — including an empty string, which is
 *    how an admin removes an optional section (highlight, policy, footer note).
 */

export const NOTICE_STATUSES = ['draft', 'published', 'archived'] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export const NOTICE_AUDIENCES = ['everyone', 'visitor', 'verified_member'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const NOTICE_FREQUENCIES = ['once', 'session', 'every_visit'] as const;
export type NoticeFrequency = (typeof NOTICE_FREQUENCIES)[number];

export const NOTICE_STYLES = ['info', 'warning', 'success', 'critical'] as const;
export type NoticeStyle = (typeof NOTICE_STYLES)[number];

export const NOTICE_PAGE_IDS = [
  'storefront.menu',
  'storefront.cart',
  'storefront.checkout',
  'storefront.access',
  'coa',
  'faq',
  'calculator',
  'track-order',
  'protocols',
] as const;
export type NoticePageId = (typeof NOTICE_PAGE_IDS)[number];

export interface StorefrontNotice {
  id: string;
  internalName: string;
  status: NoticeStatus;
  version: number;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  audience: NoticeAudience;
  pageIds: NoticePageId[];
  frequency: NoticeFrequency;
  style: NoticeStyle;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** When false the modal never renders on the storefront. */
  isEnabled: boolean;
  title: string;
  subtitle: string;
  /** Paragraphs separated by a blank line. */
  body: string;
  /** Single-line callout strip. Empty hides it. */
  highlight: string;
  policyTitle: string;
  /** One policy line per newline. */
  policyLines: string;
  buttonLabel: string;
  footerNote: string;
}

/** site_settings row shape this module reads and writes. */
export interface StorefrontNoticeSettingRow {
  id: string;
  value: string | null;
  type?: string;
  description?: string;
}

type LegacyNoticeTextField =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'highlight'
  | 'policyTitle'
  | 'policyLines'
  | 'buttonLabel'
  | 'footerNote';

const KEY_BY_FIELD = {
  isEnabled: 'storefront_notice_enabled',
  title: 'storefront_notice_title',
  subtitle: 'storefront_notice_subtitle',
  body: 'storefront_notice_body',
  highlight: 'storefront_notice_highlight',
  policyTitle: 'storefront_notice_policy_title',
  policyLines: 'storefront_notice_policy_lines',
  buttonLabel: 'storefront_notice_button_label',
  footerNote: 'storefront_notice_footer_note',
} as const satisfies Record<'isEnabled' | LegacyNoticeTextField, string>;

const TEXT_FIELDS = Object.keys(KEY_BY_FIELD).filter(
  (field): field is LegacyNoticeTextField => field !== 'isEnabled',
);

export const STOREFRONT_NOTICE_KEYS: readonly string[] = Object.values(KEY_BY_FIELD);

export const DEFAULT_STOREFRONT_NOTICE: StorefrontNotice = {
  id: 'fallback-legal-notice',
  internalName: 'Research-use legal notice',
  status: 'published',
  version: 1,
  priority: 0,
  startsAt: null,
  endsAt: null,
  audience: 'everyone',
  pageIds: ['storefront.menu'],
  frequency: 'every_visit',
  style: 'warning',
  publishedAt: null,
  createdAt: '',
  updatedAt: '',
  isEnabled: true,
  title: 'Important Notice',
  subtitle: 'Please read before continuing',
  body: [
    'Sold strictly for research purposes only, not FDA-approved, and are not intended to diagnose, treat, cure, or prevent any disease.',
    'Improper handling or use may carry risks, including possible side effects, adverse reactions, contamination, or ineffective results.',
    'Always consult a licensed healthcare professional for health-related decisions.',
  ].join('\n\n'),
  highlight: '✕ NO MEET UPS · NO PICK UPS · NO RUSH ORDERS',
  policyTitle: '🚚 Order Today, Deliver Tomorrow Policy',
  policyLines: [
    'Taking of orders: Monday - Friday',
    'Cut-off is at 5:00 PM',
    'Next Day Delivery thru J&T',
    'Weekend orders will be processed every Monday.',
  ].join('\n'),
  buttonLabel: '🛡️ I Understand & Agree',
  footerNote: 'This notice is shown on every visit to the storefront.',
};

type VersionedNotice = Pick<StorefrontNotice, 'id' | 'version' | 'frequency'>;

export const getNoticeAcknowledgementKey = (notice: Pick<VersionedNotice, 'id' | 'version'>): string =>
  `storefront-notice:${notice.id}:v${notice.version}`;

export const hasAcknowledgedNotice = (
  notice: VersionedNotice,
  local: Pick<Storage, 'getItem'>,
  session: Pick<Storage, 'getItem'>,
): boolean => {
  const key = getNoticeAcknowledgementKey(notice);
  if (notice.frequency === 'once') return local.getItem(key) === 'acknowledged';
  if (notice.frequency === 'session') return session.getItem(key) === 'acknowledged';
  return false;
};

export const acknowledgeNotice = (
  notice: VersionedNotice,
  local: Pick<Storage, 'setItem'>,
  session: Pick<Storage, 'setItem'>,
): void => {
  const key = getNoticeAcknowledgementKey(notice);
  if (notice.frequency === 'once') local.setItem(key, 'acknowledged');
  if (notice.frequency === 'session') session.setItem(key, 'acknowledged');
};

export const createBlankStorefrontNotice = (): StorefrontNotice => ({
  ...DEFAULT_STOREFRONT_NOTICE,
  id: '',
  internalName: '',
  status: 'draft',
  title: '',
  subtitle: '',
  body: '',
  highlight: '',
  policyTitle: '',
  policyLines: '',
  buttonLabel: '',
  footerNote: '',
  publishedAt: null,
  createdAt: '',
  updatedAt: '',
});

export type NoticeValidationErrors = Partial<Record<
  'internalName' | 'title' | 'body' | 'buttonLabel' | 'pageIds' | 'endsAt',
  string
>>;

export const validateNoticeForPublish = (notice: StorefrontNotice): NoticeValidationErrors => {
  const errors: NoticeValidationErrors = {};
  if (!notice.internalName.trim()) errors.internalName = 'Internal name is required.';
  if (!notice.title.trim()) errors.title = 'Title is required.';
  if (!notice.body.trim()) errors.body = 'Body is required.';
  if (!notice.buttonLabel.trim()) errors.buttonLabel = 'Button label is required.';
  if (notice.pageIds.length === 0) errors.pageIds = 'Select at least one page.';
  if (notice.startsAt && notice.endsAt && new Date(notice.endsAt) <= new Date(notice.startsAt)) {
    errors.endsAt = 'End time must be after the start time.';
  }
  return errors;
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const toManilaDatetimeLocal = (iso: string | null): string => {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? '' : new Date(time + MANILA_OFFSET_MS).toISOString().slice(0, 16);
};

export const fromManilaDatetimeLocal = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Splits notice body text into paragraphs on blank lines, dropping empties. */
export const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

/** Splits multi-line text into trimmed, non-empty lines. */
export const splitLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/** Builds the notice from raw site_settings rows, filling gaps with defaults. */
export const noticeFromSettings = (rows: readonly StorefrontNoticeSettingRow[]): StorefrontNotice => {
  const byKey = new Map(
    rows.filter((row) => typeof row.value === 'string').map((row) => [row.id, row.value as string]),
  );

  const enabledValue = byKey.get(KEY_BY_FIELD.isEnabled);

  return TEXT_FIELDS.reduce<StorefrontNotice>(
    (notice, field) => {
      const stored = byKey.get(KEY_BY_FIELD[field]);
      return stored === undefined ? notice : { ...notice, [field]: stored };
    },
    {
      ...DEFAULT_STOREFRONT_NOTICE,
      // Missing flag means enabled (matches a fresh install); only 'false' disables.
      isEnabled: enabledValue === undefined ? DEFAULT_STOREFRONT_NOTICE.isEnabled : enabledValue !== 'false',
    },
  );
};

/** Serialises the notice into site_settings rows ready for an upsert. */
export const noticeToSettingRows = (notice: StorefrontNotice): Required<StorefrontNoticeSettingRow>[] => [
  {
    id: KEY_BY_FIELD.isEnabled,
    value: notice.isEnabled ? 'true' : 'false',
    type: 'boolean',
    description: 'When true, the storefront shows the Important Notice modal on every visit.',
  },
  ...TEXT_FIELDS.map((field) => ({
    id: KEY_BY_FIELD[field],
    value: notice[field],
    type: 'string',
    description: `Storefront Important Notice — ${field}.`,
  })),
];
