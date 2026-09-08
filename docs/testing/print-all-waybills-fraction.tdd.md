# Print-all waybills printed only a fraction of the run

## Source plan

No `*.plan.md`. The journeys below were derived during this TDD run from a client
report relayed by the site owner: printing waybills produced only a fraction of
the sheets the button promised.

## What was actually live

Two different "print every waybill" surfaces exist, and only one of them shipped:

| Surface | State on `origin/main` |
|---|---|
| Group Buy batch — "Print waybills (N)" in `BatchOrdersPanel` | **Live**, added in `ad039e9 feat: expose batch waybill printing` |
| Orders screen — "Print all waybills (N)" in `OrdersManager` | **Not live** — complete and passing, but sitting uncommitted in the working tree until `c7b35dd` |

So the client was using the Group Buy batch button. `src/index.css` was byte-identical
to `origin/main` (`git diff origin/main -- src/index.css` was empty), which means the
print stylesheet under test was exactly the deployed one.

## User journeys

1. As an admin closing a Group Buy batch, I want one click to print a waybill for
   every confirmed customer in the batch, so that I can pack the whole drop in one
   pass instead of opening each order.
2. As an admin working the Orders screen, I want to print a waybill for every order
   currently shown, so that the status/batch/search filters decide the print run.
3. As an admin, I want orders with no shipment yet (`new`) or that never will have one
   (`cancelled`) skipped, so that I do not print sheets for shipments that do not exist.

## Root cause

The queue was always correct — the count on the button matched the orders. The loss
happened in the print stylesheet.

`.waybill-print-area` was `position: absolute` so it could escape the space still
reserved by the app, which was hidden with `visibility: hidden` (which keeps layout
boxes). An out-of-flow box is never fragmented across pages. That box also sat inside
`.wb-overlay` (`position: fixed; inset: 0; overflow-y: auto`) and `.wb-modal`
(`overflow: hidden`), each of which crops to a single page box in print. The browser
filled page one and discarded the remainder.

The fix removes the reason the escape hatch existed: the app shell now leaves the print
layout outright (`display: none` on `#root`, scoped to a `wb-print-open` flag that
`WaybillModal` sets while mounted), so the whole chain stays in normal flow and unclipped
and the existing per-sheet page breaks apply. Scoping to the flag leaves ordinary
printing of the site unchanged.

## Task report

### 1. Reproduce the loss in real print output

jsdom performs no layout and never applies `@media print`, so no render test can observe
this. Reproduced instead with Chrome headless `--print-to-pdf` against a fixture that
embeds the real stylesheet and the real overlay DOM, then counting `/Type /Page` objects.

```
$ "Google Chrome" --headless --print-to-pdf=out-live.pdf  fixture-live.html
$ "Google Chrome" --headless --print-to-pdf=out-fixed.pdf fixture-fixed.html

8 waybills queued:
  live  CSS -> 3 page(s)     <- the client's "fraction"
  fixed CSS -> 8 page(s)
```

Sweeping the queue size shows the loss is a hard cap, not a proportion — the live CSS
prints the same three pages no matter how many waybills are queued, while the fixed CSS
tracks the queue exactly:

| Waybills queued | live CSS | fixed CSS |
|---|---|---|
| 3 | 3 pages | 3 pages |
| 8 | 3 pages | 8 pages |
| 12 | **3 pages** | 12 pages |

That is why the bug survived review: a small batch prints correctly and looks fine, and
only a real drop loses sheets. The larger the batch, the more is silently dropped.

### 2. RED — pin the properties that decide pagination

```
$ npx vitest run src/waybillPrintCss.test.ts
  Tests  5 failed | 1 passed (6)
  × keeps the print area in normal flow so sheets paginate past page one
  × returns the fixed, scrolling overlay to normal flow for print
  × unclips the modal shell for print
  × drops the app shell from the print layout while a waybill overlay is open
  × removes the overlay chrome from the print layout
  ✓ starts every sheet after the first on a fresh page   <- already correct

$ npx vitest run src/components/waybill/WaybillModal.test.tsx
  Tests  1 failed | 5 passed (6)
  × marks the document as printing a waybill while open
```

The one passing CSS assertion matters: the per-sheet page-break rules were already
right, which is why the failure was not obvious — the sheets were correctly broken up,
they were just being clipped away.

### 3. GREEN — after the fix

```
$ npx vitest run src/waybillPrintCss.test.ts                      6 passed (6)
$ npx vitest run src/components/waybill/WaybillModal.test.tsx     6 passed (6)
$ npx vitest run src/components/waybill/Waybill.test.tsx          4 passed (4)
$ npx vitest run src/components/groupbuy/BatchOrdersPanel.test.tsx 9 passed (9)
$ npx vitest run src/utils/waybill.test.ts                       41 passed (41)
```

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | The print area is never taken out of normal flow, so sheets fragment across pages | `src/waybillPrintCss.test.ts:keeps the print area in normal flow…` | unit (CSS contract) | PASS | `npx vitest run src/waybillPrintCss.test.ts` |
| 2 | The fixed, scrolling overlay is returned to normal flow for print | `src/waybillPrintCss.test.ts:returns the fixed, scrolling overlay…` | unit (CSS contract) | PASS | same |
| 3 | The modal shell does not clip the run | `src/waybillPrintCss.test.ts:unclips the modal shell for print` | unit (CSS contract) | PASS | same |
| 4 | The app shell leaves the print layout while an overlay is open | `src/waybillPrintCss.test.ts:drops the app shell from the print layout…` | unit (CSS contract) | PASS | same |
| 5 | Overlay chrome leaves the layout rather than reserving blank space | `src/waybillPrintCss.test.ts:removes the overlay chrome…` | unit (CSS contract) | PASS | same |
| 6 | Each sheet stays whole and starts its own page | `src/waybillPrintCss.test.ts:starts every sheet after the first…` | unit (CSS contract) | PASS | same |
| 7 | The modal marks the document while open so the print CSS can target it | `WaybillModal.test.tsx:marks the document as printing a waybill while open` | component | PASS | `npx vitest run src/components/waybill/WaybillModal.test.tsx` |
| 8 | The mark is cleared when the overlay closes | `WaybillModal.test.tsx:clears the mark once the overlay closes` | component | PASS | same |
| 9 | One printable page is rendered per queued waybill | `WaybillModal.test.tsx:renders one printable page per waybill` | component | PASS | same |
| 10 | `new` and `cancelled` orders are skipped from a print run | `src/utils/waybill.test.ts:printableWaybillOrders` | unit | PASS | `npx vitest run src/utils/waybill.test.ts` |
| 11 | N queued waybills produce N printed pages (3, 8, 12) | Chrome `--print-to-pdf`, `/Type /Page` count | manual (real print output) | PASS | live capped at 3 pages → fixed 3/8/12 |

## Coverage and known gaps

- No coverage tooling is configured in `package.json` (`test` is `vitest run`; there is
  no `test:coverage` script and no coverage provider installed), so the 80% figure was
  not measured for this change. Recorded as a gap rather than claimed.
- **`OrdersManager.tsx` has no component test.** The new "Print all waybills" button and
  the `printQueue` wiring are covered only at the util level
  (`printableWaybillOrders`). The screen has no test file at all and its Supabase-backed
  loading would have to be stood up first. The batch surface the client actually reported
  is covered by `BatchOrdersPanel.test.tsx`.
- The print verification is a fixture carrying the real stylesheet and the real overlay
  DOM, not the running admin app, because the admin screens are behind auth. The
  stylesheet and DOM structure under test are the shipped ones.
- Pre-existing `tsc -p tsconfig.app.json` errors remain in files untouched here
  (`batchCloseoutExport.test.ts`, `checkoutPrefill.test.ts`, `groupBuyOverview.test.ts`,
  `orderTracking.test.ts`, `pasaloCapMigrations.test.ts`). None involve the changed files.

## Merge evidence

- `7670779 test:` RED — reproducer added; 5 CSS assertions + 1 component assertion failing
  for the intended reason (print-layout properties absent).
- `8114ed1 fix:` GREEN — print CSS reworked and the `wb-print-open` flag added; all
  waybill suites pass and Chrome prints 8/8 pages.
- `c7b35dd feat:` the Orders-screen print-all, previously uncommitted, committed so it can ship.

**Not deployed.** All three commits are local on `feat/gb-landing-homepage`; nothing has
been pushed, so the live site still has the clipping bug until this branch ships.
