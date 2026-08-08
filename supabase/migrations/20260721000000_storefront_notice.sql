-- ===========================================================================
-- Storefront "Important Notice" pop-up.
--
-- A blocking acknowledgement modal shown on EVERY visit to the storefront
-- (the acknowledgement is deliberately not persisted client-side). Every
-- string is admin-editable from Admin → Settings → Storefront Notice.
--
-- Stored as one site_settings row per field so no new table, grant, or RLS
-- policy is needed — the storefront already reads site_settings anonymously
-- and the admin dashboard already writes to it.
--
-- Idempotent: ON CONFLICT DO NOTHING never clobbers an admin's edited copy.
-- Missing rows fall back to the same defaults in src/utils/storefrontNotice.ts,
-- so the notice still renders correctly if this seed is never applied.
-- ===========================================================================

INSERT INTO site_settings (id, value, type, description) VALUES
  (
    'storefront_notice_enabled',
    'true',
    'boolean',
    'When true, the storefront shows the Important Notice modal on every visit.'
  ),
  (
    'storefront_notice_title',
    'Important Notice',
    'string',
    'Storefront Important Notice — heading.'
  ),
  (
    'storefront_notice_subtitle',
    'Please read before continuing',
    'string',
    'Storefront Important Notice — sub-heading. Blank hides it.'
  ),
  (
    'storefront_notice_body',
    E'Sold strictly for research purposes only, not FDA-approved, and are not intended to diagnose, treat, cure, or prevent any disease.\n\nImproper handling or use may carry risks, including possible side effects, adverse reactions, contamination, or ineffective results.\n\nAlways consult a licensed healthcare professional for health-related decisions.',
    'string',
    'Storefront Important Notice — body copy. Paragraphs separated by a blank line.'
  ),
  (
    'storefront_notice_highlight',
    '✕ NO MEET UPS · NO PICK UPS · NO RUSH ORDERS',
    'string',
    'Storefront Important Notice — single-line callout strip. Blank hides it.'
  ),
  (
    'storefront_notice_policy_title',
    '🚚 Order Today, Deliver Tomorrow Policy',
    'string',
    'Storefront Important Notice — policy card heading. Blank hides it.'
  ),
  (
    'storefront_notice_policy_lines',
    E'Taking of orders: Monday - Friday\nCut-off is at 5:00 PM\nNext Day Delivery thru J&T\nWeekend orders will be processed every Monday.',
    'string',
    'Storefront Important Notice — policy card lines, one per newline. Blank hides the card.'
  ),
  (
    'storefront_notice_button_label',
    '🛡️ I Understand & Agree',
    'string',
    'Storefront Important Notice — acknowledgement button label.'
  ),
  (
    'storefront_notice_footer_note',
    'This notice is shown on every visit to the storefront.',
    'string',
    'Storefront Important Notice — small print under the button. Blank hides it.'
  )
ON CONFLICT (id) DO NOTHING;
