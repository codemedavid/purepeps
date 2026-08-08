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

export interface StorefrontNotice {
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
} as const satisfies Record<keyof StorefrontNotice, string>;

const TEXT_FIELDS = Object.keys(KEY_BY_FIELD).filter(
  (field): field is Exclude<keyof StorefrontNotice, 'isEnabled'> => field !== 'isEnabled',
);

export const STOREFRONT_NOTICE_KEYS: readonly string[] = Object.values(KEY_BY_FIELD);

export const DEFAULT_STOREFRONT_NOTICE: StorefrontNotice = {
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
