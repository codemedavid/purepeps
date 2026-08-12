import { beforeEach, describe, it, expect } from 'vitest';
import {
  DEFAULT_STOREFRONT_NOTICE,
  STOREFRONT_NOTICE_KEYS,
  noticeFromSettings,
  noticeToSettingRows,
  getNoticeAcknowledgementKey,
  hasAcknowledgedNotice,
  acknowledgeNotice,
  createBlankStorefrontNotice,
  fromManilaDatetimeLocal,
  toManilaDatetimeLocal,
  validateNoticeForPublish,
  splitLines,
  splitParagraphs,
} from './storefrontNotice';

describe('managed notice validation', () => {
  it('allows incomplete drafts but reports every publication blocker', () => {
    const draft = createBlankStorefrontNotice();

    expect(validateNoticeForPublish(draft)).toEqual({
      internalName: 'Internal name is required.',
      title: 'Title is required.',
      body: 'Body is required.',
      buttonLabel: 'Button label is required.',
    });
  });

  it('requires at least one target page and an end after the start', () => {
    const notice = {
      ...DEFAULT_STOREFRONT_NOTICE,
      pageIds: [],
      startsAt: '2026-08-12T10:00:00.000Z',
      endsAt: '2026-08-12T09:00:00.000Z',
    };

    expect(validateNoticeForPublish(notice)).toEqual(expect.objectContaining({
      pageIds: 'Select at least one page.',
      endsAt: 'End time must be after the start time.',
    }));
  });

  it('accepts the complete legal notice', () => {
    expect(validateNoticeForPublish(DEFAULT_STOREFRONT_NOTICE)).toEqual({});
  });
});

describe('Manila scheduling values', () => {
  it('formats UTC timestamps for a Manila datetime-local control', () => {
    expect(toManilaDatetimeLocal('2026-08-12T10:30:00.000Z')).toBe('2026-08-12T18:30');
  });

  it('stores Manila datetime-local values as UTC', () => {
    expect(fromManilaDatetimeLocal('2026-08-12T18:30')).toBe('2026-08-12T10:30:00.000Z');
    expect(fromManilaDatetimeLocal('')).toBeNull();
  });
});

describe('notice acknowledgements', () => {
  const notice = {
    ...DEFAULT_STOREFRONT_NOTICE,
    id: '6f8a5363-56b9-4fdd-a985-260c8f910ccb',
    version: 3,
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keys an acknowledgement by notice id and published version', () => {
    expect(getNoticeAcknowledgementKey(notice)).toBe(
      'storefront-notice:6f8a5363-56b9-4fdd-a985-260c8f910ccb:v3',
    );
  });

  it('stores once-per-browser acknowledgements in local storage', () => {
    const once = { ...notice, frequency: 'once' as const };

    expect(hasAcknowledgedNotice(once, localStorage, sessionStorage)).toBe(false);
    acknowledgeNotice(once, localStorage, sessionStorage);

    expect(hasAcknowledgedNotice(once, localStorage, sessionStorage)).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });

  it('stores once-per-session acknowledgements in session storage', () => {
    const session = { ...notice, frequency: 'session' as const };

    acknowledgeNotice(session, localStorage, sessionStorage);

    expect(hasAcknowledgedNotice(session, localStorage, sessionStorage)).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('does not persist every-visit acknowledgements', () => {
    const everyVisit = { ...notice, frequency: 'every_visit' as const };

    acknowledgeNotice(everyVisit, localStorage, sessionStorage);

    expect(hasAcknowledgedNotice(everyVisit, localStorage, sessionStorage)).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('splitParagraphs', () => {
  it('splits text on blank lines', () => {
    expect(splitParagraphs('First para.\n\nSecond para.')).toEqual(['First para.', 'Second para.']);
  });

  it('keeps single newlines inside a paragraph', () => {
    expect(splitParagraphs('Line one\nline two')).toEqual(['Line one\nline two']);
  });

  it('trims surrounding whitespace and drops empty paragraphs', () => {
    expect(splitParagraphs('  A  \n\n\n\n   \n\n B ')).toEqual(['A', 'B']);
  });

  it('returns an empty array for empty or whitespace-only text', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('   \n  ')).toEqual([]);
  });
});

describe('splitLines', () => {
  it('splits text on newlines and trims each line', () => {
    expect(splitLines('Taking of orders: Mon - Fri\n  Cut-off is at 5:00 PM ')).toEqual([
      'Taking of orders: Mon - Fri',
      'Cut-off is at 5:00 PM',
    ]);
  });

  it('drops blank lines', () => {
    expect(splitLines('A\n\n\nB\n')).toEqual(['A', 'B']);
  });

  it('returns an empty array for empty text', () => {
    expect(splitLines('')).toEqual([]);
  });
});

describe('noticeFromSettings', () => {
  it('returns the defaults when no rows exist', () => {
    expect(noticeFromSettings([])).toEqual(DEFAULT_STOREFRONT_NOTICE);
  });

  it('maps stored rows onto the notice fields', () => {
    const notice = noticeFromSettings([
      { id: 'storefront_notice_title', value: 'Heads Up' },
      { id: 'storefront_notice_subtitle', value: 'Read this' },
      { id: 'storefront_notice_body', value: 'Para one.\n\nPara two.' },
      { id: 'storefront_notice_highlight', value: 'NO RUSH ORDERS' },
      { id: 'storefront_notice_policy_title', value: '🚚 Delivery Policy' },
      { id: 'storefront_notice_policy_lines', value: 'Mon - Fri\nCut-off 5PM' },
      { id: 'storefront_notice_button_label', value: 'Got it' },
      { id: 'storefront_notice_footer_note', value: 'Shown every visit.' },
    ]);

    expect(notice.title).toBe('Heads Up');
    expect(notice.subtitle).toBe('Read this');
    expect(notice.body).toBe('Para one.\n\nPara two.');
    expect(notice.highlight).toBe('NO RUSH ORDERS');
    expect(notice.policyTitle).toBe('🚚 Delivery Policy');
    expect(notice.policyLines).toBe('Mon - Fri\nCut-off 5PM');
    expect(notice.buttonLabel).toBe('Got it');
    expect(notice.footerNote).toBe('Shown every visit.');
  });

  it('is enabled by default when the flag row is missing', () => {
    expect(noticeFromSettings([]).isEnabled).toBe(true);
  });

  it('is disabled only when the flag is the string "false"', () => {
    expect(noticeFromSettings([{ id: 'storefront_notice_enabled', value: 'false' }]).isEnabled).toBe(false);
    expect(noticeFromSettings([{ id: 'storefront_notice_enabled', value: 'true' }]).isEnabled).toBe(true);
  });

  it('lets an admin clear a section with an explicit empty value', () => {
    // A stored row wins even when blank — that is how a section is removed.
    // Defaults apply only when the row is absent entirely.
    const notice = noticeFromSettings([
      { id: 'storefront_notice_highlight', value: '' },
      { id: 'storefront_notice_footer_note', value: '' },
    ]);
    expect(notice.highlight).toBe('');
    expect(notice.footerNote).toBe('');
    expect(notice.title).toBe(DEFAULT_STOREFRONT_NOTICE.title);
  });

  it('ignores unrelated site_settings rows', () => {
    const notice = noticeFromSettings([{ id: 'site_name', value: 'Pure Peps' }]);
    expect(notice).toEqual(DEFAULT_STOREFRONT_NOTICE);
  });

  it('ignores null values', () => {
    const notice = noticeFromSettings([{ id: 'storefront_notice_title', value: null }]);
    expect(notice.title).toBe(DEFAULT_STOREFRONT_NOTICE.title);
  });
});

describe('noticeToSettingRows', () => {
  it('produces one upsertable row per notice field', () => {
    const rows = noticeToSettingRows(DEFAULT_STOREFRONT_NOTICE);
    expect(rows).toHaveLength(STOREFRONT_NOTICE_KEYS.length);
    expect(rows.map((row) => row.id).sort()).toEqual([...STOREFRONT_NOTICE_KEYS].sort());
  });

  it('serialises the enabled flag as a boolean string', () => {
    const rows = noticeToSettingRows({ ...DEFAULT_STOREFRONT_NOTICE, isEnabled: false });
    const flag = rows.find((row) => row.id === 'storefront_notice_enabled');
    expect(flag?.value).toBe('false');
    expect(flag?.type).toBe('boolean');
  });

  it('serialises text fields as strings', () => {
    const rows = noticeToSettingRows({ ...DEFAULT_STOREFRONT_NOTICE, title: 'Heads Up' });
    const title = rows.find((row) => row.id === 'storefront_notice_title');
    expect(title?.value).toBe('Heads Up');
    expect(title?.type).toBe('string');
  });

  it('round-trips through noticeFromSettings', () => {
    const edited = {
      ...DEFAULT_STOREFRONT_NOTICE,
      isEnabled: false,
      title: 'Heads Up',
      body: 'One.\n\nTwo.',
      policyLines: 'A\nB',
    };
    expect(noticeFromSettings(noticeToSettingRows(edited))).toEqual(edited);
  });
});
