-- ===========================================================================
-- Group Buy landing page content (Admin -> Settings -> Group Buy Landing).
--
-- The public homepage is a single Group Buy section: status badge, headline,
-- description, a four-stage timeline, two calls to action and a closing note.
-- Every one of those strings is admin-editable, so none of them is written
-- into the application code.
--
-- Stored as one site_settings row per field, exactly like the per-feature
-- visibility switches (20260824000200_feature_visibility_flags.sql) and the
-- storefront notice. No new table, grant or RLS policy is needed: the
-- storefront already reads site_settings anonymously, the admin dashboard
-- already writes to it, and the table is already in the supabase_realtime
-- publication, so an edit reaches open tabs without a reload.
--
-- The stage DATE and TIME rows are seeded EMPTY on purpose. They describe a
-- specific batch, so inventing values here would put fiction on the homepage;
-- an empty value renders nothing until an admin fills it in.
--
-- Idempotent: ON CONFLICT DO NOTHING never clobbers an admin's edited copy.
-- Missing rows fall back to the same defaults in src/utils/gbLanding.ts, so the
-- homepage still renders correctly if this seed is never applied.
-- ===========================================================================

INSERT INTO site_settings (id, value, type, description) VALUES
  -- Section ---------------------------------------------------------------
  ('gb_landing_status_mode', 'auto', 'string',
   'Group Buy landing page - status badge mode: auto (follow the live batch), open, or closed.'),
  ('gb_landing_status_text', 'Group Buy', 'string',
   'Group Buy landing page - status badge text. The resolved Open/Closed word is appended.'),
  ('gb_landing_headline', 'Research peptides,', 'string',
   'Group Buy landing page - main headline.'),
  ('gb_landing_headline_highlight', 'priced by the crowd.', 'string',
   'Group Buy landing page - highlighted headline text. Blank hides it.'),
  ('gb_landing_description',
   'Third-party tested vials, at least 99% HPLC verified. Pool your order with the group and every vial gets cheaper as members commit.',
   'string',
   'Group Buy landing page - supporting description under the headline.'),
  ('gb_landing_timeline_title', 'GB Timeline', 'string',
   'Group Buy landing page - timeline section title.'),

  -- Stage 1 ---------------------------------------------------------------
  ('gb_landing_stage1_icon', 'unlock', 'string',
   'Group Buy landing page - stage 1 icon.'),
  ('gb_landing_stage1_title', 'GB Open', 'string',
   'Group Buy landing page - stage 1 title.'),
  ('gb_landing_stage1_description', 'Ordering is live. Browse the catalog and reserve your vials.', 'string',
   'Group Buy landing page - stage 1 description.'),
  ('gb_landing_stage1_date', '', 'string',
   'Group Buy landing page - stage 1 date. Free text, e.g. "Sep 05". Blank hides it.'),
  ('gb_landing_stage1_time', '', 'string',
   'Group Buy landing page - stage 1 time / ETA. Free text. Blank hides it.'),

  -- Stage 2 ---------------------------------------------------------------
  ('gb_landing_stage2_icon', 'timer', 'string',
   'Group Buy landing page - stage 2 icon.'),
  ('gb_landing_stage2_title', 'Order Cut-off', 'string',
   'Group Buy landing page - stage 2 title.'),
  ('gb_landing_stage2_description', 'Last call. Carts close and no new orders are accepted.', 'string',
   'Group Buy landing page - stage 2 description.'),
  ('gb_landing_stage2_date', '', 'string',
   'Group Buy landing page - stage 2 date. Free text. Blank hides it.'),
  ('gb_landing_stage2_time', '', 'string',
   'Group Buy landing page - stage 2 time / ETA. Free text. Blank hides it.'),

  -- Stage 3 ---------------------------------------------------------------
  ('gb_landing_stage3_icon', 'send', 'string',
   'Group Buy landing page - stage 3 icon.'),
  ('gb_landing_stage3_title', 'Order Submission', 'string',
   'Group Buy landing page - stage 3 title.'),
  ('gb_landing_stage3_description', 'The pooled order is placed with the supplier.', 'string',
   'Group Buy landing page - stage 3 description.'),
  ('gb_landing_stage3_date', '', 'string',
   'Group Buy landing page - stage 3 date. Free text. Blank hides it.'),
  ('gb_landing_stage3_time', '', 'string',
   'Group Buy landing page - stage 3 time / ETA. Free text. Blank hides it.'),

  -- Stage 4 ---------------------------------------------------------------
  ('gb_landing_stage4_icon', 'truck', 'string',
   'Group Buy landing page - stage 4 icon.'),
  ('gb_landing_stage4_title', 'ETA / Shipping', 'string',
   'Group Buy landing page - stage 4 title.'),
  ('gb_landing_stage4_description', 'Stock lands and ships out to members, cold-chain.', 'string',
   'Group Buy landing page - stage 4 description.'),
  ('gb_landing_stage4_date', '', 'string',
   'Group Buy landing page - stage 4 date / ETA range. Free text, e.g. "Oct 10 - 18". Blank hides it.'),
  ('gb_landing_stage4_time', '', 'string',
   'Group Buy landing page - stage 4 time / status. Free text. Blank hides it.'),

  -- Calls to action -------------------------------------------------------
  ('gb_landing_cta_primary_label', 'Browse the Catalog', 'string',
   'Group Buy landing page - primary CTA label. Blank hides the button.'),
  ('gb_landing_cta_primary_action', 'catalog', 'string',
   'Group Buy landing page - primary CTA action. One of: catalog, access, cart, track_order, faq, reviews, none.'),
  ('gb_landing_cta_secondary_label', 'Get Access', 'string',
   'Group Buy landing page - secondary CTA label. Blank hides the button.'),
  ('gb_landing_cta_secondary_action', 'access', 'string',
   'Group Buy landing page - secondary CTA action. One of: catalog, access, cart, track_order, faq, reviews, none.'),

  -- Closing note ----------------------------------------------------------
  ('gb_landing_bottom_note', 'The more members join, the lower the price!', 'string',
   'Group Buy landing page - bottom supporting text. Blank hides it.')
ON CONFLICT (id) DO NOTHING;
