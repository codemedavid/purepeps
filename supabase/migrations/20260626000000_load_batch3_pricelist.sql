-- Pure Peps — Batch 3 Pricelist load
-- Replaces the entire product catalog with the Batch 3 pricelist.
-- Pricing basis: PER KIT.  Items sharing a name are grouped into one product
-- with one variation per dose/volume.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Categories: ensure the three pricelist categories, deactivate the rest
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO categories (id, name, icon, sort_order, active) VALUES
  ('c0a80122-0001-4e78-94f8-585d77059101', 'Mixing Supplies', 'FlaskConical', 1, true),
  ('c0a80122-0003-4e78-94f8-585d77059103', 'Biorhythm',       'Activity',     3, true)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, active = true;

-- Reuse existing "Peptides" category, place it between the two new ones
UPDATE categories SET sort_order = 2, active = true
  WHERE id = 'c0a80121-0001-4e78-94f8-585d77059001';

-- Hide the categories that no longer hold any products
UPDATE categories SET active = false WHERE id IN (
  'c0a80121-0002-4e78-94f8-585d77059002',  -- Weight Management
  'c0a80121-0003-4e78-94f8-585d77059003',  -- Beauty & Anti-Aging
  'c0a80121-0004-4e78-94f8-585d77059004',  -- Wellness & Vitality
  'c0a80121-0005-4e78-94f8-585d77059005',  -- GLP-1 Agonists
  'c0a80121-0006-4e78-94f8-585d77059006',  -- Insulin Pens
  'c0a80121-0007-4e78-94f8-585d77059007',  -- Accessories
  'c0a80121-0008-4e78-94f8-585d77059008'   -- Bundles & Kits
);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Remove the old catalog (and dependent rows)
-- ──────────────────────────────────────────────────────────────────────────
DELETE FROM group_buy_caps WHERE product_id IN (SELECT id FROM products);
UPDATE protocols SET product_id = NULL WHERE product_id IN (SELECT id FROM products);
DELETE FROM product_variations WHERE product_id IN (SELECT id FROM products);
DELETE FROM products;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Insert the new products (base_price filled in step 5)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO products (name, description, category, base_price, stock_quantity, available, featured)
SELECT v.name, v.name, v.category, 0, 100, true, false
FROM (VALUES
  -- Mixing Supplies
  ('Acetic Acid Water',                      'c0a80122-0001-4e78-94f8-585d77059101'),
  ('Bacteriostatic Water',                   'c0a80122-0001-4e78-94f8-585d77059101'),
  ('Pharma Bacteriostatic Water (Genetek)',  'c0a80122-0001-4e78-94f8-585d77059101'),
  ('Sterile Water',                          'c0a80122-0001-4e78-94f8-585d77059101'),
  -- Peptides
  ('ACE-031',                                'c0a80121-0001-4e78-94f8-585d77059001'),
  ('5-Amino-1MQ',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Adamax',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Adipotide',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('AHK-CU',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('AICARA',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Alprostadil',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('AOD-9604',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('ARA-290',                                'c0a80121-0001-4e78-94f8-585d77059001'),
  ('B12',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Botulinum Toxin',                        'c0a80121-0001-4e78-94f8-585d77059001'),
  ('BPC-157 + TB500',                        'c0a80121-0001-4e78-94f8-585d77059001'),
  ('BPC-157',                                'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Bronchogen',                             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Cagrilintide',                           'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Cagrilintide + Semaglutide',             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Cardiogen',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Cartalax',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('CJC-1295 with DAC',                      'c0a80121-0001-4e78-94f8-585d77059001'),
  ('CJC-1295 without DAC',                   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('CJC-1295 w/o DAC + Ipamorelin',          'c0a80121-0001-4e78-94f8-585d77059001'),
  ('DSIP',                                   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Epithalon',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('EPO',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('FOX04',                                  'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GAZ',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GGH',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GHK + KPV',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GHK-CU',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GHRP-2 Acetate',                         'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GHRP-6 Acetate',                         'c0a80121-0001-4e78-94f8-585d77059001'),
  ('GLOW BLEND (TB + BPC + GHK-CU)',         'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Glutathione',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Gonadorelin Acetate',                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Healthy Hair Skin Nail Blend',           'c0a80121-0001-4e78-94f8-585d77059001'),
  ('HGH 191AA',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('IGF-1 LR3',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Ipamorelin',                             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Kisspeptin',                             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('KLOW BLEND (TB + BPC + GHK-CU + KPV)',   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('KPV',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('L-Carnitine',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Lemon Bottle (China)',                   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Lipo-C',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Lipo-C with Vitamins B12',               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Lipo-C Focus',                           'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Lipo C Fat Blaster (Pink)',              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Lipo Mino Mix',                          'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Liraglutide',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Livagen',                                'c0a80121-0001-4e78-94f8-585d77059001'),
  ('LL37',                                   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Matrixyl',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Mazdutide',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Melatonin',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('MOTS-c',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Mounjaro Pre-filled',                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('MT-1',                                   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('MT-2 (Melanotan 2 Acetate)',             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('N-Acetyl Epithalon Amidate',             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('N-Acetyl Selank Amidate',                'c0a80121-0001-4e78-94f8-585d77059001'),
  ('NAD+',                                   'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Ovagen',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Oxytocin Acetate',                       'c0a80121-0001-4e78-94f8-585d77059001'),
  ('P21',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Pancragen',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('PE 22-28',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('PEG MGF',                                'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Pinealon',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('PNC 27',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Prostamax',                              'c0a80121-0001-4e78-94f8-585d77059001'),
  ('PT-141',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Relax PM',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Retatrutide + Cagrilintide',             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Retatrutide',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Selank',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Semaglutide',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Semax',                                  'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Semax + Selank',                         'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Sermorelin Acetate',                     'c0a80121-0001-4e78-94f8-585d77059001'),
  ('SLU-PP-322',                             'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Snap-8',                                 'c0a80121-0001-4e78-94f8-585d77059001'),
  ('SS-31',                                  'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Super Human Blend',                      'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Super Shred Blend',                      'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Survodutide',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('TB500 (Thymosin B4 Acetate)',            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Teriparatide',                           'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Tesamorelin',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Testagen',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Thymakin',                               'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Thymosin Alpha-1',                       'c0a80121-0001-4e78-94f8-585d77059001'),
  ('Tirzepatide',                            'c0a80121-0001-4e78-94f8-585d77059001'),
  ('VIP',                                    'c0a80121-0001-4e78-94f8-585d77059001'),
  -- Biorhythm
  ('Lemon Bottle (Branded)',                 'c0a80122-0003-4e78-94f8-585d77059103'),
  ('Lipo Vela',                              'c0a80122-0003-4e78-94f8-585d77059103'),
  ('Lipo Vela V-Line',                       'c0a80122-0003-4e78-94f8-585d77059103'),
  ('Lipo Lab Amber Bottle',                  'c0a80122-0003-4e78-94f8-585d77059103'),
  ('Lemon Bottle 50mL',                      'c0a80122-0003-4e78-94f8-585d77059103'),
  ('Aqualyx',                                'c0a80122-0003-4e78-94f8-585d77059103')
) AS v(name, category);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Insert variations (PER KIT price). quantity_mg is used only for sorting.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity)
SELECT p.id, v.vname, v.qty, v.price, 100
FROM products p
JOIN (VALUES
  -- Mixing Supplies
  ('Acetic Acid Water',                     '3mL',          3,      868),
  ('Acetic Acid Water',                     '10mL',         10,     930),
  ('Bacteriostatic Water',                  '3mL',          3,      800),
  ('Bacteriostatic Water',                  '5mL',          5,      900),
  ('Bacteriostatic Water',                  '10mL',         10,     950),
  ('Pharma Bacteriostatic Water (Genetek)', '10mL',         10,     900),
  ('Sterile Water',                         '5mL',          5,      350),
  -- Peptides
  ('ACE-031',                               '1mg',          1,      3015),
  ('5-Amino-1MQ',                           '5mg',          5,      2800),
  ('5-Amino-1MQ',                           '10mg',         10,     3600),
  ('5-Amino-1MQ',                           '50mg',         50,     4700),
  ('Adamax',                                '5mg',          5,      7500),
  ('Adipotide',                             '2mg',          2,      4757),
  ('Adipotide',                             '5mg',          5,      9179),
  ('AHK-CU',                                '100mg',        100,    4000),
  ('AICARA',                                '50mg',         50,     3600),
  ('AICARA',                                '100mg',        100,    5600),
  ('Alprostadil',                           '20mcg',        0.02,   3600),
  ('AOD-9604',                              '5mg',          5,      6350),
  ('AOD-9604',                              '10mg',         10,     10400),
  ('ARA-290',                               '10mg',         10,     3685),
  ('B12',                                   '10mL',         10,     1860),
  ('Botulinum Toxin',                       '100iu',        100,    7035),
  ('BPC-157 + TB500',                       '5mg + 5mg',    10,     5695),
  ('BPC-157 + TB500',                       '10mg + 10mg',  20,     11055),
  ('BPC-157',                               '5mg',          5,      2852),
  ('BPC-157',                               '10mg',         10,     3844),
  ('BPC-157',                               '20mg',         20,     6901),
  ('Bronchogen',                            '20mg',         20,     6400),
  ('Cagrilintide',                          '5mg',          5,      4700),
  ('Cagrilintide',                          '10mg',         10,     7700),
  ('Cagrilintide',                          '20mg',         20,     12300),
  ('Cagrilintide + Semaglutide',            '5mg + 5mg',    10,     6500),
  ('Cardiogen',                             '20mg',         20,     6400),
  ('Cartalax',                              '20mg',         20,     6000),
  ('CJC-1295 with DAC',                     '2mg',          2,      6400),
  ('CJC-1295 with DAC',                     '5mg',          5,      8300),
  ('CJC-1295 with DAC',                     '10mg',         10,     10800),
  ('CJC-1295 without DAC',                  '5mg',          5,      5000),
  ('CJC-1295 without DAC',                  '10mg',         10,     8000),
  ('CJC-1295 w/o DAC + Ipamorelin',         '5mg + 5mg',    10,     5700),
  ('DSIP',                                  '5mg',          5,      2800),
  ('DSIP',                                  '10mg',         10,     4000),
  ('DSIP',                                  '15mg',         15,     5200),
  ('Epithalon',                             '10mg',         10,     3200),
  ('Epithalon',                             '20mg',         20,     8200),
  ('EPO',                                   '3000IU',       3000,   4757),
  ('FOX04',                                 '10mg',         10,     19765),
  ('GAZ',                                   '10mL',         10,     9500),
  ('GGH',                                   '10mL',         10,     7400),
  ('GHK + KPV',                             '50mg + 10mg',  60,     5600),
  ('GHK-CU',                                '50mg',         50,     1980),
  ('GHK-CU',                                '100mg',        100,    2604),
  ('GHRP-2 Acetate',                        '5mg',          5,      2345),
  ('GHRP-2 Acetate',                        '10mg',         10,     3350),
  ('GHRP-2 Acetate',                        '15mg',         15,     4020),
  ('GHRP-6 Acetate',                        '5mg',          5,      2345),
  ('GHRP-6 Acetate',                        '10mg',         10,     3350),
  ('GLOW BLEND (TB + BPC + GHK-CU)',        '70mg',         70,     11460),
  ('Glutathione',                           '600mg',        600,    3300),
  ('Glutathione',                           '1200mg (Korean)', 1200, 3400),
  ('Glutathione',                           '1500mg (FUAN)', 1500,  3720),
  ('Gonadorelin Acetate',                   '2mg',          2,      3283),
  ('Healthy Hair Skin Nail Blend',          '10mL',         10,     6500),
  ('HGH 191AA',                             '15iu',         15,     3348),
  ('HGH 191AA',                             '24iu',         24,     4340),
  ('IGF-1 LR3',                             '100mcg',       0.1,    2345),
  ('IGF-1 LR3',                             '1mg',          1,      9715),
  ('Ipamorelin',                            '5mg',          5,      3906),
  ('Ipamorelin',                            '10mg',         10,     4087),
  ('Kisspeptin',                            '5mg',          5,      3400),
  ('Kisspeptin',                            '10mg',         10,     4700),
  ('KLOW BLEND (TB + BPC + GHK-CU + KPV)',  '80mg',         80,     11900),
  ('KPV',                                   '5mg',          5,      2666),
  ('KPV',                                   '10mg',         10,     3348),
  ('L-Carnitine',                           '600mg',        600,    3800),
  ('L-Carnitine',                           '1200mg',       1200,   4800),
  ('Lemon Bottle (China)',                  '10mL',         10,     3600),
  ('Lemon Bottle (China)',                  '50mL',         50,     8700),
  ('Lipo-C',                                '10mL',         10,     3720),
  ('Lipo-C with Vitamins B12',              '10mL',         10,     3720),
  ('Lipo-C Focus',                          '10mL',         10,     6300),
  ('Lipo C Fat Blaster (Pink)',             '10mL',         10,     5000),
  ('Lipo Mino Mix',                         '10mL',         10,     6400),
  ('Liraglutide',                           '5mg',          5,      5025),
  ('Liraglutide',                           '10mg',         10,     6700),
  ('Liraglutide',                           '30mg',         30,     13400),
  ('Livagen',                               '20mg',         20,     6901),
  ('LL37',                                  '5mg',          5,      4757),
  ('Matrixyl',                              '20mg',         20,     2814),
  ('Mazdutide',                             '5mg',          5,      4700),
  ('Mazdutide',                             '10mg',         10,     8300),
  ('Melatonin',                             '10mg',         10,     3500),
  ('MOTS-c',                                '10mg',         10,     3720),
  ('MOTS-c',                                '15mg',         15,     6834),
  ('MOTS-c',                                '20mg',         20,     9045),
  ('MOTS-c',                                '40mg',         40,     9715),
  ('Mounjaro Pre-filled',                   '15mg',         15,     20140),
  ('Mounjaro Pre-filled',                   '30mg',         30,     30220),
  ('MT-1',                                  '1 vial',       0,      2747),
  ('MT-2 (Melanotan 2 Acetate)',            '10mg',         10,     2479),
  ('N-Acetyl Epithalon Amidate',            '5mg',          5,      4020),
  ('N-Acetyl Selank Amidate',               '30mg',         30,     9380),
  ('NAD+',                                  '100mg',        100,    2400),
  ('NAD+',                                  '500mg',        500,    3400),
  ('NAD+',                                  '1000mg',       1000,   7000),
  ('Ovagen',                                '20mg',         20,     6901),
  ('Oxytocin Acetate',                      '2mg',          2,      2345),
  ('Oxytocin Acetate',                      '5mg',          5,      3551),
  ('Oxytocin Acetate',                      '10mg',         10,     4757),
  ('P21',                                   '10mg',         10,     5025),
  ('Pancragen',                             '20mg',         20,     6901),
  ('PE 22-28',                              '10mg',         10,     4556),
  ('PEG MGF',                               '2mg',          2,      5561),
  ('Pinealon',                              '5mg',          5,      2820),
  ('Pinealon',                              '10mg',         10,     4200),
  ('Pinealon',                              '20mg',         20,     5500),
  ('PNC 27',                                '5mg',          5,      5695),
  ('PNC 27',                                '10mg',         10,     9045),
  ('Prostamax',                             '20mg',         20,     6901),
  ('PT-141',                                '10mg',         10,     3286),
  ('Relax PM',                              '10mL',         10,     7000),
  ('Retatrutide + Cagrilintide',            '5mg + 5mg',    10,     8000),
  ('Retatrutide',                           '5mg',          5,      3500),
  ('Retatrutide',                           '10mg',         10,     5100),
  ('Retatrutide',                           '15mg',         15,     6300),
  ('Retatrutide',                           '20mg',         20,     7600),
  ('Retatrutide',                           '30mg',         30,     9500),
  ('Retatrutide',                           '40mg',         40,     11600),
  ('Selank',                                '5mg',          5,      2850),
  ('Selank',                                '10mg',         10,     3300),
  ('Semaglutide',                           '2mg',          2,      1943),
  ('Semaglutide',                           '5mg',          5,      2345),
  ('Semaglutide',                           '10mg',         10,     3015),
  ('Semaglutide',                           '15mg',         15,     3819),
  ('Semaglutide',                           '20mg',         20,     4489),
  ('Semaglutide',                           '30mg',         30,     5695),
  ('Semaglutide',                           '40mg',         40,     6231),
  ('Semaglutide',                           '50mg',         50,     6700),
  ('Semax',                                 '5mg',          5,      2500),
  ('Semax',                                 '10mg',         10,     3100),
  ('Semax + Selank',                        '10mg + 10mg',  20,     5100),
  ('Sermorelin Acetate',                    '5mg',          5,      3906),
  ('Sermorelin Acetate',                    '10mg',         10,     6076),
  ('SLU-PP-322',                            '5mg',          5,      5500),
  ('SLU-PP-322',                            '10mg',         10,     7300),
  ('Snap-8',                                '10mg',         10,     2480),
  ('SS-31',                                 '10mg',         10,     5025),
  ('SS-31',                                 '50mg',         50,     16415),
  ('Super Human Blend',                     '10mL',         10,     7400),
  ('Super Shred Blend',                     '10mL',         10,     6400),
  ('Survodutide',                           '10mg',         10,     13000),
  ('TB500 (Thymosin B4 Acetate)',           '2mg',          2,      2900),
  ('TB500 (Thymosin B4 Acetate)',           '5mg',          5,      4300),
  ('TB500 (Thymosin B4 Acetate)',           '10mg',         10,     6300),
  ('TB500 (Thymosin B4 Acetate)',           '20mg',         20,     12300),
  ('Teriparatide',                          '10mg',         10,     10000),
  ('Tesamorelin',                           '2mg',          2,      4757),
  ('Tesamorelin',                           '5mg',          5,      5695),
  ('Tesamorelin',                           '10mg',         10,     9715),
  ('Tesamorelin',                           '20mg',         20,     19095),
  ('Testagen',                              '20mg',         20,     7035),
  ('Thymakin',                              '10mg',         10,     4824),
  ('Thymosin Alpha-1',                      '5mg',          5,      5025),
  ('Thymosin Alpha-1',                      '10mg',         10,     9045),
  ('Tirzepatide',                           '5mg',          5,      2542),
  ('Tirzepatide',                           '10mg',         10,     3162),
  ('Tirzepatide',                           '15mg',         15,     4087),
  ('Tirzepatide',                           '20mg',         20,     4891),
  ('Tirzepatide',                           '30mg',         30,     6097),
  ('Tirzepatide',                           '40mg',         40,     7303),
  ('Tirzepatide',                           '50mg',         50,     8643),
  ('Tirzepatide',                           '60mg',         60,     9983),
  ('Tirzepatide',                           '100mg',        100,    14070),
  ('Tirzepatide',                           '120mg',        120,    15075),
  ('VIP',                                   '5mg',          5,      4355),
  ('VIP',                                   '10mg',         10,     7705),
  -- Biorhythm
  ('Lemon Bottle (Branded)',                '5 vials / Box',  0,    3200),
  ('Lipo Vela',                             'Per Box',        0,    2900),
  ('Lipo Vela V-Line',                      'Per Box',        0,    2900),
  ('Lipo Lab Amber Bottle',                 '10 vials / Box', 0,    2400),
  ('Lemon Bottle 50mL',                     'Per Piece',      0,    800),
  ('Aqualyx',                               'Per Box',        0,    1700)
) AS v(pname, vname, qty, price) ON p.name = v.pname;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Set each product's base_price to its lowest variation (a "from" price)
-- ──────────────────────────────────────────────────────────────────────────
UPDATE products p
SET base_price = sub.min_price
FROM (
  SELECT product_id, MIN(price) AS min_price
  FROM product_variations
  GROUP BY product_id
) sub
WHERE p.id = sub.product_id;
