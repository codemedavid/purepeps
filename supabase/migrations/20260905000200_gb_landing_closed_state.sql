-- ===========================================================================
-- Group Buy landing page — the "between buys" panel.
--
-- While the buy is closed, the four timeline stages describe a schedule that
-- has already finished, so the homepage swaps the timeline card for this panel
-- and announces the next buy instead. Like every other string on that page it
-- is admin-editable (Admin -> Settings -> Group Buy Landing).
--
-- The DATE row is seeded EMPTY on purpose: it names a specific future buy, and
-- inventing one here would announce a date that does not exist. An empty value
-- simply omits the line until an admin fills it in.
--
-- Idempotent: ON CONFLICT DO NOTHING never clobbers an admin's edited copy.
-- Missing rows fall back to the same defaults in src/utils/gbLanding.ts.
-- ===========================================================================

INSERT INTO site_settings (id, value, type, description) VALUES
  ('gb_landing_closed_title', 'Next Group Buy', 'string',
   'Group Buy landing page - closed-state heading, shown instead of the timeline between buys.'),
  ('gb_landing_closed_date', '', 'string',
   'Group Buy landing page - closed-state date, e.g. "October 15" or "announcing soon". Blank hides the line.'),
  ('gb_landing_closed_message',
   'This group buy has closed. The next one opens soon - check back for the schedule.',
   'string',
   'Group Buy landing page - closed-state supporting text.')
ON CONFLICT (id) DO NOTHING;
