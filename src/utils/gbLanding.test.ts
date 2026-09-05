import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GB_LANDING,
  GB_LANDING_KEYS,
  gbLandingFromRows,
  gbLandingToRows,
  parseCtaAction,
  parseStageIcon,
  resolveGbStatus,
  type GbLandingSettingRow,
} from './gbLanding';

const rows = (entries: Record<string, string | null>): GbLandingSettingRow[] =>
  Object.entries(entries).map(([id, value]) => ({ id, value }));

describe('gbLandingFromRows', () => {
  it('falls back to the defaults when no rows exist', () => {
    expect(gbLandingFromRows([])).toEqual(DEFAULT_GB_LANDING);
    expect(gbLandingFromRows(null)).toEqual(DEFAULT_GB_LANDING);
  });

  it('lets a stored value win over the default', () => {
    const content = gbLandingFromRows(
      rows({
        gb_landing_headline: 'Batch 12 is live,',
        gb_landing_headline_highlight: 'join before Friday.',
        gb_landing_bottom_note: 'More members, lower price.',
      }),
    );

    expect(content.headline).toBe('Batch 12 is live,');
    expect(content.headlineHighlight).toBe('join before Friday.');
    expect(content.bottomNote).toBe('More members, lower price.');
  });

  it('treats a stored empty string as a deliberate blank, not a missing value', () => {
    const content = gbLandingFromRows(rows({ gb_landing_headline_highlight: '' }));

    expect(content.headlineHighlight).toBe('');
    // Untouched fields still fall back.
    expect(content.headline).toBe(DEFAULT_GB_LANDING.headline);
  });

  it('ignores rows that belong to other settings', () => {
    const content = gbLandingFromRows(rows({ feature_faq_enabled: 'false', site_name: 'Other' }));

    expect(content).toEqual(DEFAULT_GB_LANDING);
  });

  it('ignores a row whose value is null', () => {
    const content = gbLandingFromRows(rows({ gb_landing_headline: null }));

    expect(content.headline).toBe(DEFAULT_GB_LANDING.headline);
  });

  it('reads all four stages independently', () => {
    const content = gbLandingFromRows(
      rows({
        gb_landing_stage1_title: 'GB OPEN',
        gb_landing_stage1_date: 'Sep 05',
        gb_landing_stage2_title: 'ORDER CUT-OFF',
        gb_landing_stage2_time: '5:00 PM',
        gb_landing_stage3_description: 'Pooled order goes to the supplier.',
        gb_landing_stage4_date: 'Oct 10 - 18',
        gb_landing_stage4_time: 'Estimated',
      }),
    );

    expect(content.stages).toHaveLength(4);
    expect(content.stages[0].title).toBe('GB OPEN');
    expect(content.stages[0].date).toBe('Sep 05');
    expect(content.stages[1].title).toBe('ORDER CUT-OFF');
    expect(content.stages[1].time).toBe('5:00 PM');
    expect(content.stages[2].description).toBe('Pooled order goes to the supplier.');
    expect(content.stages[3].date).toBe('Oct 10 - 18');
    expect(content.stages[3].time).toBe('Estimated');
    // A stage the admin never touched keeps its default title.
    expect(content.stages[2].title).toBe(DEFAULT_GB_LANDING.stages[2].title);
  });
});

describe('gbLandingFromRows — closed-state copy', () => {
  it('reads the closed-state title, date and message', () => {
    const content = gbLandingFromRows(
      rows({
        gb_landing_closed_title: 'Next Group Buy',
        gb_landing_closed_date: 'October 15',
        gb_landing_closed_message: 'Batch 13 opens after the long weekend.',
      }),
    );

    expect(content.closedTitle).toBe('Next Group Buy');
    expect(content.closedDate).toBe('October 15');
    expect(content.closedMessage).toBe('Batch 13 opens after the long weekend.');
  });

  it('falls back to the defaults so the closed panel is never empty', () => {
    const content = gbLandingFromRows([]);

    expect(content.closedTitle).toBe(DEFAULT_GB_LANDING.closedTitle);
    expect(content.closedMessage).toBe(DEFAULT_GB_LANDING.closedMessage);
    // The date is batch-specific, so it starts blank for the admin to fill in.
    expect(content.closedDate).toBe('');
  });

  it('lets the admin blank the closed date', () => {
    const content = gbLandingFromRows(rows({ gb_landing_closed_date: '' }));

    expect(content.closedDate).toBe('');
  });
});

describe('parseCtaAction', () => {
  it.each(['catalog', 'access', 'cart', 'track_order', 'faq', 'reviews', 'none'] as const)(
    'accepts the whitelisted action %s',
    (action) => {
      expect(parseCtaAction(action)).toBe(action);
    },
  );

  it.each([
    ['javascript:alert(1)'],
    ['https://evil.example.com'],
    ['data:text/html,<script>'],
    ['CATALOG '],
    [''],
  ])('rejects %s and falls back to none', (value) => {
    expect(parseCtaAction(value)).toBe('none');
  });

  it('rejects null and undefined', () => {
    expect(parseCtaAction(null)).toBe('none');
    expect(parseCtaAction(undefined)).toBe('none');
  });
});

describe('parseStageIcon', () => {
  it('accepts a whitelisted icon name', () => {
    expect(parseStageIcon('truck', 'unlock')).toBe('truck');
  });

  it('falls back to the given default for an unknown icon', () => {
    expect(parseStageIcon('skull', 'timer')).toBe('timer');
    expect(parseStageIcon(null, 'send')).toBe('send');
  });
});

describe('resolveGbStatus', () => {
  it('follows the live batch in auto mode', () => {
    expect(resolveGbStatus('auto', true)).toBe('open');
    expect(resolveGbStatus('auto', false)).toBe('closed');
  });

  it('lets an explicit mode override the live batch', () => {
    expect(resolveGbStatus('open', false)).toBe('open');
    expect(resolveGbStatus('closed', true)).toBe('closed');
  });

  it('defaults to auto so a bad stored value never contradicts the batch', () => {
    expect(resolveGbStatus('nonsense' as never, false)).toBe('closed');
    expect(resolveGbStatus('nonsense' as never, true)).toBe('open');
  });
});

describe('gbLandingToRows', () => {
  it('round-trips through gbLandingFromRows', () => {
    const edited = {
      ...DEFAULT_GB_LANDING,
      statusMode: 'closed' as const,
      headline: 'Edited headline',
      headlineHighlight: '',
      closedTitle: 'Next drop',
      closedDate: 'Nov 02',
      closedMessage: '',
      primaryCtaAction: 'reviews' as const,
      stages: DEFAULT_GB_LANDING.stages.map((stage, index) => ({
        ...stage,
        title: `Stage ${index + 1}`,
        date: `Day ${index + 1}`,
      })) as unknown as typeof DEFAULT_GB_LANDING.stages,
    };

    expect(gbLandingFromRows(gbLandingToRows(edited))).toEqual(edited);
  });

  it('emits exactly one row per known key', () => {
    const emitted = gbLandingToRows(DEFAULT_GB_LANDING).map((row) => row.id);

    expect(emitted).toHaveLength(GB_LANDING_KEYS.length);
    expect([...emitted].sort()).toEqual([...GB_LANDING_KEYS].sort());
  });

  it('describes every row so the settings table stays self-documenting', () => {
    for (const row of gbLandingToRows(DEFAULT_GB_LANDING)) {
      expect(row.type).toBe('string');
      expect(row.description.length).toBeGreaterThan(0);
    }
  });
});

describe('GB_LANDING_KEYS', () => {
  // 14 section-level fields + 4 stages x 5 fields (icon, title, description,
  // date, time). The brief lists 27 explicitly and omits the stage icons, but
  // it also says each stage has an icon and that nothing in the timeline may be
  // hardcoded — so the icons are admin-editable too. The last three are the
  // closed-state panel shown in place of the timeline between buys.
  it('covers the 34 admin-editable fields with no duplicates', () => {
    expect(GB_LANDING_KEYS).toHaveLength(34);
    expect(new Set(GB_LANDING_KEYS).size).toBe(34);
  });

  it('namespaces every key so it cannot collide with another setting', () => {
    for (const key of GB_LANDING_KEYS) expect(key.startsWith('gb_landing_')).toBe(true);
  });
});
