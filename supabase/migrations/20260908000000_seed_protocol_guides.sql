-- Pure Peps — seed the Guides page's peptide protocols.
--
-- WHY: `protocols` was empty (0 rows), which is why the Guides page reported
-- "0 protocol(s) found" and "No protocols found in this category" under the
-- All Categories filter. The page was not broken — it had nothing to render.
--
-- Categories are written in the CANONICAL spelling defined by
-- src/utils/protocolCategories.ts. A protocol may sit in several categories via
-- a comma list; the storefront splits on the comma and shows each category once
-- in the dropdown, so "Weight Loss" can never appear twice however many
-- protocols claim it.
--
-- Content is deliberately conservative research-note style: general ranges, the
-- handling that actually matters (reconstitution, storage, titration), and no
-- medical claims. Every card the storefront renders sits under the site's
-- existing "consult a healthcare professional" framing.
--
-- IDEMPOTENT: each row is inserted only when no protocol of that name exists,
-- so re-running never duplicates and never overwrites an admin's later edits.

INSERT INTO public.protocols (
  name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type
)
SELECT
  seed.name, seed.category, seed.dosage, seed.frequency, seed.duration,
  seed.notes, seed.storage, seed.sort_order, true, 'text'
FROM (
  VALUES
    (
      'Tirzepatide',
      'Weight Loss',
      'Start 2.5mg, titrate to 5-15mg',
      'Once weekly, same day each week',
      'Titration over 12+ weeks',
      ARRAY[
        'Weeks 1-4: 2.5mg once weekly. This is a tolerance step, not a target dose.',
        'Increase by 2.5mg no sooner than every 4 weeks, and only if the current dose is well tolerated.',
        'Most users settle between 5mg and 10mg. Going higher faster mostly buys nausea.',
        'Reconstitute with bacteriostatic water down the vial wall. Swirl, never shake.',
        'Eat slowly and stop at first fullness - GI upset is the most common reason people quit.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      10
    ),
    (
      'Retatrutide',
      'Weight Loss',
      'Start 1mg, titrate to 4-8mg',
      'Once weekly',
      'Titration over 12+ weeks',
      ARRAY[
        'Start at the low end. Retatrutide is a triple agonist and is felt more strongly than a single-pathway compound at the same milligram.',
        'Hold each step at least 4 weeks before increasing.',
        'Heart rate can run higher during titration; ease off the step if it stays elevated.',
        'Keep protein and fluids up - appetite suppression is steep.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      20
    ),
    (
      'Cagrilintide',
      'Weight Loss',
      '0.25mg - 2.4mg',
      'Once weekly',
      '8-12 weeks',
      ARRAY[
        'Often run alongside a GLP-1 rather than on its own; the pairing is why the blends exist.',
        'Titrate slowly - nausea early on usually means the last step was too big.',
        'Rotate injection sites between abdomen, thigh and upper arm.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      30
    ),
    (
      '5-Amino-1MQ',
      'Weight Loss, Fat Dissolvers',
      '50mg - 150mg',
      'Once daily',
      '8-12 weeks',
      ARRAY[
        'Oral capsule or subcutaneous depending on the form you hold - check your vial before dosing.',
        'Taken in the morning; it is not sedating and does not need to be timed to food.',
        'Commonly paired with resistance training, since the point is body composition rather than scale weight alone.',
        'Cycle it. Continuous use past ~12 weeks has no supporting data.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      40
    ),
    (
      'AOD-9604',
      'Weight Loss, Fat Dissolvers',
      '300mcg - 500mcg',
      'Once daily, fasted',
      '8-12 weeks',
      ARRAY[
        'Dose fasted - typically on waking, 20-30 minutes before food.',
        'A fragment of HGH that does not carry the growth-hormone effects, so it is not a mass-building compound.',
        'Effects are gradual. Judge it at 8 weeks, not 8 days.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      50
    ),
    (
      'Lipo-C',
      'Fat Dissolvers',
      '1mL per injection',
      '1-2x weekly',
      '4-8 weeks',
      ARRAY[
        'A lipotropic blend (methionine, inositol, choline, B12) - a metabolic support injection, not a spot-reduction treatment.',
        'Intramuscular into the glute or deltoid, rotating sides each time.',
        'Comes premixed. Do not add bacteriostatic water.',
        'Mild flushing or a B-vitamin smell to urine is expected and harmless.'
      ],
      'Refrigerate at 2-8°C. Protect from light.',
      60
    ),
    (
      'Lemon Bottle',
      'Fat Dissolvers',
      'Per treatment area, administered by a trained injector',
      'Every 2-4 weeks',
      '3-5 sessions',
      ARRAY[
        'A lipolytic solution for small, localised areas - administered by a trained injector only.',
        'Swelling and tenderness for 3-7 days after a session is the normal course.',
        'Sessions are spaced 2-4 weeks apart to let the area settle before the next.',
        'Not a substitute for a calorie deficit; it addresses contour, not overall weight.'
      ],
      'Store at 2-8°C, away from light. Do not freeze.',
      70
    ),
    (
      'L-Carnitine',
      'Fat Dissolvers',
      '200mg - 500mg',
      '2-3x weekly',
      '8-12 weeks',
      ARRAY[
        'Usually timed 30-60 minutes before training, when fatty-acid transport is actually being asked for.',
        'Injectable form bypasses the poor oral absorption that limits the capsule.',
        'Injection-site soreness is common; rotate sites and inject slowly.'
      ],
      'Refrigerate at 2-8°C.',
      80
    ),
    (
      'GHK-Cu',
      'Anti Aging, Skin Hair',
      '1mg - 2mg',
      'Daily or every other day',
      '4-8 weeks',
      ARRAY[
        'Copper peptide used for skin remodelling, collagen support and hair follicle work.',
        'Subcutaneous near the target area, or topical from a properly formulated serum - not both at full strength at once.',
        'The blue colour on reconstitution is the copper complex and is expected.',
        'Copper accumulates. Cycle 4-8 weeks on, then take a comparable break.'
      ],
      'Lyophilized: 2-8°C, protect from light. Reconstituted: 2-8°C, use within 20 days.',
      90
    ),
    (
      'Epithalon',
      'Anti Aging',
      '5mg - 10mg',
      'Daily for 10-20 days',
      '2-3 short courses per year',
      ARRAY[
        'Run as a short course, not continuously - 10-20 consecutive days, then a long break.',
        'Commonly dosed in the evening.',
        'Two to three courses a year is the usual pattern; more is not better here.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 14 days.',
      100
    ),
    (
      'NAD+',
      'Anti Aging, Wellness Immunity',
      '50mg - 100mg',
      '2-3x weekly',
      '4-8 weeks',
      ARRAY[
        'Inject SLOWLY. Pushing NAD+ fast causes chest tightness, flushing and nausea - the single most common complaint, and entirely rate-dependent.',
        'Start at the low end for the first few doses to find your tolerance.',
        'Morning dosing suits most people; it can be stimulating.',
        'Reconstituted NAD+ is light sensitive - keep it in the box, in the fridge.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, protect from light, use within 14 days.',
      110
    ),
    (
      'MOTS-c',
      'Anti Aging, Muscle Performance',
      '5mg - 10mg',
      '2-3x weekly',
      '4-6 weeks',
      ARRAY[
        'A mitochondrial peptide, usually paired with training rather than run in isolation.',
        'Morning or pre-training dosing.',
        'Cycle 4-6 weeks, then break.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      120
    ),
    (
      'BPC-157',
      'Recovery Healing',
      '250mcg - 500mcg',
      'Once or twice daily',
      '4-8 weeks',
      ARRAY[
        'Inject subcutaneously near the site being worked on where practical.',
        'Frequently paired with TB-500 for soft-tissue work; the blends in the catalog exist for that reason.',
        'Consistency matters more than dose size - daily at 250mcg beats sporadic at 500mcg.',
        'Judge progress at 4 weeks.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      130
    ),
    (
      'CJC-1295 + Ipamorelin',
      'Muscle Performance, Anti Aging',
      '100mcg of each per dose',
      '5 nights per week, before bed',
      '8-12 weeks',
      ARRAY[
        'Dose on an empty stomach - at least 2 hours after the last meal, ideally at bedtime.',
        'Carbohydrate and fat near the dose blunt the pulse, which is the whole point of the timing.',
        '5 days on, 2 off is the common pattern to limit desensitisation.',
        'Water retention and tingling hands in the first weeks usually settle.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 28 days.',
      140
    ),
    (
      'DSIP',
      'Sleep Recovery',
      '100mcg - 300mcg',
      'Nightly, 30 minutes before bed',
      '2-4 weeks',
      ARRAY[
        'Delta Sleep-Inducing Peptide - taken shortly before bed, not during the day.',
        'Start at 100mcg. Higher doses are more likely to leave grogginess in the morning, not deeper sleep.',
        'Short courses only; tolerance builds with continuous nightly use.'
      ],
      'Lyophilized: 2-8°C. Reconstituted: 2-8°C, use within 14 days.',
      150
    )
) AS seed (name, category, dosage, frequency, duration, notes, storage, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.protocols existing
  WHERE lower(btrim(existing.name)) = lower(btrim(seed.name))
);

-- Normalize any category text already in the table onto the canonical spelling,
-- collapsing the near-duplicates that produced two "Weight Loss" options in the
-- public dropdown. Only exact known variants are rewritten - an unrecognised
-- category is left alone rather than guessed at.
UPDATE public.protocols
SET category = 'Weight Loss', updated_at = NOW()
WHERE lower(btrim(category)) IN ('weight management', 'weight loss', 'weightloss', 'fat loss')
  AND category <> 'Weight Loss';

UPDATE public.protocols
SET category = 'Fat Dissolvers', updated_at = NOW()
WHERE lower(btrim(category)) IN ('fat dissolver', 'fat dissolvers', 'fat dissolving')
  AND category <> 'Fat Dissolvers';

UPDATE public.protocols
SET category = 'Anti Aging', updated_at = NOW()
WHERE lower(btrim(category)) IN ('anti aging', 'anti-aging', 'antiaging', 'skin & anti-aging')
  AND category <> 'Anti Aging';
