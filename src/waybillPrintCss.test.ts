import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import postcss, { type Declaration, type Rule } from 'postcss';

/**
 * Print-layout contract for the waybill overlay.
 *
 * "Print all waybills" queues N sheets into one `WaybillModal`. Whether all N
 * actually reach paper is decided entirely by CSS: the browser paginates the
 * print area only when that node and every ancestor between it and `<body>`
 * stay in normal flow and never clip. Break any link in that chain and the
 * browser lays the sheets out inside a single page-sized box and drops the
 * overflow — the admin gets one page instead of N.
 *
 * jsdom performs no layout and never applies `@media print`, so a render test
 * cannot catch this. These assertions read the shipped stylesheet directly and
 * pin the properties that decide pagination.
 */

const CSS_PATH = resolve(__dirname, 'index.css');
const root = postcss.parse(readFileSync(CSS_PATH, 'utf8'), { from: CSS_PATH });

/** Every declaration for `selector` inside `@media print`, later rules winning. */
function printDeclarations(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();

  root.walkAtRules('media', (atRule) => {
    if (!atRule.params.includes('print')) return;

    atRule.walkRules((rule: Rule) => {
      const selectors = rule.selectors.map((entry) => entry.trim());
      if (!selectors.includes(selector)) return;

      rule.walkDecls((decl: Declaration) => {
        declarations.set(decl.prop, decl.value.replace(/\s*!important$/, '').trim());
      });
    });
  });

  return declarations;
}

/** True when `@media print` has any rule whose selector matches `pattern`. */
function hasPrintRuleMatching(pattern: RegExp): boolean {
  let found = false;

  root.walkAtRules('media', (atRule) => {
    if (!atRule.params.includes('print')) return;
    atRule.walkRules((rule: Rule) => {
      if (rule.selectors.some((entry) => pattern.test(entry.trim()))) found = true;
    });
  });

  return found;
}

const OUT_OF_FLOW = new Set(['absolute', 'fixed']);

describe('waybill print layout contract', () => {
  // The regression the client reported: "Print all waybills" produced only a
  // fraction of the sheets. An absolutely positioned box is not fragmented
  // across pages — the browser prints whatever fits on page one and discards
  // the rest, so a 12-waybill run came out as a single page.
  it('keeps the print area in normal flow so sheets paginate past page one', () => {
    const printArea = printDeclarations('.waybill-print-area');
    const position = printArea.get('position');

    expect(position === undefined || !OUT_OF_FLOW.has(position)).toBe(true);
  });

  // `.wb-overlay` is `position: fixed; inset: 0; overflow-y: auto` on screen. A
  // fixed ancestor is sized to a single page box in print and its overflow is
  // clipped, so the sheets below the fold never reach paper.
  it('returns the fixed, scrolling overlay to normal flow for print', () => {
    const overlay = printDeclarations('.wb-overlay');

    expect(overlay.get('position')).toBe('static');
    expect(overlay.get('overflow')).toBe('visible');
  });

  // `.wb-modal` is `overflow: hidden` on screen to clip its rounded corners.
  // Left in place for print, it clips every sheet past the first page.
  it('unclips the modal shell for print', () => {
    const modal = printDeclarations('.wb-modal');

    expect(modal.get('overflow')).toBe('visible');
  });

  // Hiding the app with `visibility: hidden` leaves its boxes occupying layout,
  // which is why the print area was pulled out of flow in the first place.
  // Dropping `#root` from the print layout entirely removes that pressure and
  // lets the overlay start on page one while still flowing across pages.
  it('drops the app shell from the print layout while a waybill overlay is open', () => {
    expect(hasPrintRuleMatching(/#root/)).toBe(true);

    const shell = printDeclarations('body.wb-print-open > #root');
    expect(shell.get('display')).toBe('none');
  });

  // The toolbar sits inside the overlay; once the overlay itself prints, the
  // chrome has to be removed from layout rather than merely made invisible, or
  // it reserves blank space at the top of the first sheet.
  it('removes the overlay chrome from the print layout', () => {
    const chrome = printDeclarations('.wb-no-print');

    expect(chrome.get('display')).toBe('none');
  });

  // Sheet-level pagination: each sheet stays whole and starts its own page.
  it('starts every sheet after the first on a fresh page', () => {
    const between = printDeclarations('.wb-page + .wb-page');
    const page = printDeclarations('.wb-page');

    expect(between.get('page-break-before')).toBe('always');
    expect(page.get('page-break-inside')).toBe('avoid');
  });
});
