# TDD evidence — lab reports and protocol guides must be readable on Pure Peps only

**Branch:** `feat/gb-landing-homepage`
**Commits:**
- Lab reports: `ca5a369` (RED) → `6cf2a3c` (GREEN) → `d7349d5` (refactor)
- Protocol guides: `3f1d020` (RED) → `9841e06` (GREEN) → `08d1b05` (refactor)

## Source plan

No `*.plan.md`. The journeys were derived from two requests:

1. *"is the website still asking the users to download the coa image or redirect
   the users to the imagekit website? i want it to be viewable to my website only."*
2. *"do the guides page also"* — after the browser check showed the guides viewer
   still had a Download button and an "Open in new tab" link to ImageKit.

## What was actually wrong

The `/coa` page behaved differently per file type:

| COA file type | Before | Verdict |
|---|---|---|
| Image (jpg/png) | Modal rendered `<img src={image_url}>` in-page | Already correct |
| **PDF** | `<iframe src={imagekitUrl}>` plus an **"Open PDF in new tab"** link to `ik.imagekit.io` | Left the site |

Mobile Safari and Chrome on Android do not render a framed cross-origin PDF, so
the iframe produced a blank panel or a download prompt; the sibling link was a
literal redirect to the CDN. The protocol guides had already solved this with
`ProtocolFileViewer` + `src/lib/pdf.ts`; the COA page never received it.

## User journey

> As a customer checking a batch's lab report, I want to read the certificate
> without leaving Pure Peps or saving a file, so that I can verify purity in the
> flow I am already in — on a phone.

## Task report

| Task | Validation command | RED | GREEN |
|---|---|---|---|
| PDF reports render in-site | `npx vitest run src/components/COA.test.tsx` | 5 failed \| 1 passed (6) | 6 passed (6) |
| Guides viewer unaffected by the shared-hook refactor | `npx vitest run src/components/ProtocolFileViewer.test.tsx src/components/ProtocolGuide.test.tsx src/components/COA.test.tsx src/utils/protocolFiles.test.ts` | n/a | 48 passed (48) |

RED excerpt (`ca5a369`):

```
Tests  5 failed | 1 passed (6)
TestingLibraryElementError: Unable to find role="img" and name `/^Page \d+ of 2$/`
TestingLibraryElementError: Unable to find an element with the text: /couldn't be displayed/i
```

The single passing test at RED is the evidence that image COAs were already
in-site — only the PDF path was broken.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A PDF certificate is rasterised page-by-page inside the page, from its own URL | `COA.test.tsx:draws a PDF report page by page inside the site` | component | PASS |
| 2 | No `iframe`/`embed`/`object` hands the document to the browser's PDF plugin | `COA.test.tsx:never hands a PDF report to the browser as a framed CDN document` | component | PASS |
| 3 | An open report contains no link to `ik.imagekit.io` and no "open in new tab" | `COA.test.tsx:offers no route off to ImageKit from an open report` | component | PASS |
| 4 | Reading a report never requires a download (no download link, no `ik-attachment`) | `COA.test.tsx:never asks the customer to download the report to read it` | component | PASS |
| 5 | Image certificates still display in-page, without invoking pdf.js | `COA.test.tsx:shows an image report in the page rather than linking to the file` | component | PASS |
| 6 | A report that fails to load explains itself on-site rather than offering the CDN | `COA.test.tsx:explains a report it cannot draw instead of bouncing the customer to the CDN` | component | PASS |
| 7 | The guides viewer keeps its download + new-tab affordances after the refactor | `ProtocolFileViewer.test.tsx` (12 tests) | component | PASS |

## Changes

- `src/hooks/usePdfPages.ts` (new) — load/render/status cycle for pdf.js, lifted
  out of `ProtocolFileViewer` so both surfaces share one implementation.
- `src/components/CoaReportViewer.tsx` (new) — the lab-report modal, extracted
  from `COA.tsx`. Draws PDF pages, shows images in place, closes on Escape.
- `src/components/COA.tsx` — iframe and "Open PDF in new tab" removed; the
  `Download`/`ExternalLink` icons on what is a viewer became `Eye`. 306 → 268 lines.
- `src/components/ProtocolFileViewer.tsx` — refactored onto the hook. 190 → 130 lines.
- `src/utils/protocolFiles.ts` — `isPdfFile` is now the single extension
  predicate; `COA.tsx` had carried a duplicate.

## Coverage and known gaps

No coverage tooling is configured in `package.json` (`test` is `vitest run`), so
no percentage is quoted. The six behaviours above are covered at the component
level, which is where this defect lived.

Full suite: **1775 passed (1775)**. Two test FILES fail to collect —
`useReturningCustomer.test.ts` and `checkoutPrefill.test.ts` — which are the
known pre-existing orphans, unrelated to this change.

`npx tsc --noEmit -p tsconfig.app.json` reports **no error in any changed file**
(the repo has ~100 pre-existing error lines elsewhere; the count went 102 → 100).

**Deliberately not done:** nothing here prevents a determined viewer from saving
the underlying file — the ImageKit URL is still fetched by the browser, so
right-click/save and devtools remain possible. Closing that off would need
signed, expiring ImageKit URLs behind a server endpoint, which is a separate
piece of work. What this change guarantees is that the *product* never asks for
a download and never navigates the customer to the CDN.


---

# Part 2 — Protocol guides

The COA fix reused the guides page's in-site PDF rendering, but the guides viewer
itself still ended in an actions bar: a **Download** button (`?ik-attachment=true`)
and an **"Open in new tab"** link straight to `ik.imagekit.io`. The card that opened
it read *"Click to view or download"* under a Download icon.

## Was removing the download safe?

Yes. `ProtocolManager.tsx:345` advertises `.pdf,.doc,.docx,.txt,.xls,.xlsx`, but the
upload actually runs through `useImageUpload`, whose validator
(`src/hooks/useImageUpload.ts:47-52`) accepts only image extensions plus `pdf`.
A `.docx` is rejected before it can be stored, so every attachable protocol file is
one pdf.js can draw. Confirmed against live data: 25 protocols, 24 `text` and
1 `file` — that one a PDF.

## Task report

| Task | Validation command | RED | GREEN |
|---|---|---|---|
| Viewer keeps readers on-site | `npx vitest run src/components/ProtocolFileViewer.test.tsx` | 3 failed \| 10 passed (13) | 13 passed (13) |
| Card copy stops promising a download | `npx vitest run src/components/ProtocolGuide.test.tsx` | 3 failed \| 17 passed (20) | 20 passed (20) |
| Dead helpers removed | `npx vitest run` over the 4 affected suites | n/a | 47 passed (47) |

RED excerpt (`3f1d020`):

```
Tests  3 failed | 10 passed (13)
AssertionError: expected document not to contain element, found <a ...>
  x offers no download and no route off to the file host
  x explains a failed render without bouncing the reader to the CDN
  x never leaves a blank box for a file type it cannot draw
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 8 | An open guide has no download link, no `a[download]`, no new-tab link and no `ik.imagekit.io` href | `ProtocolFileViewer.test.tsx:offers no download and no route off to the file host` | component | PASS |
| 9 | The guide is never framed from the CDN | `ProtocolFileViewer.test.tsx:never frames the file straight from the CDN` | component | PASS |
| 10 | A failed render explains itself without offering the CDN | `ProtocolFileViewer.test.tsx:explains a failed render without bouncing the reader to the CDN` | component | PASS |
| 11 | A file type pdf.js cannot draw gets a panel, not a blank box or a download | `ProtocolFileViewer.test.tsx:never leaves a blank box for a file type it cannot draw` | component | PASS |
| 12 | The card reads "Click to view" and links nowhere | `ProtocolGuide.test.tsx:keeps the customer on Pure Peps instead of linking out to the file host` | component | PASS |
| 13 | `isPdfFile` handles pdf/uppercase/query-string/docx/image/no-extension/empty/null/undefined | `protocolFiles.test.ts` (8 tests) | unit | PASS |

## Changes

- `src/components/ProtocolFileViewer.tsx` — actions bar removed; both failure
  panels now point at us rather than at a download button that no longer exists.
- `src/components/ProtocolGuide.tsx` — card copy "Click to view or download" →
  "Click to view"; trailing `Download` icon → `Eye`.
- `src/utils/protocolFiles.ts` — `toDownloadUrl` and `isPreviewableFile` deleted.
  With the download gone both were reachable only from their own tests;
  `isPdfFile` is the single remaining predicate, now covered directly.

## Browser verification (Chrome, live Supabase data)

Both surfaces were driven in a real browser, not only in jsdom.

`/protocols` → GHK CU 50MG Protocol:

```
canvases: 5            pixelDims: 5 x 904x1169
iframes: 0             embeds/objects: 0
imagekitAnchors: []    a[download]: 0
"ik-attachment" in HTML: false
"open in new tab" text: false
the word "download" anywhere on the page: false
pageUrl: http://localhost:5173/protocols   (never navigates away)
```

At a 390x844 phone viewport the dialog scrolls through all five pages
(scrollTop 1057 of 3019) with `document.body.scrollWidth === window.innerWidth`
— no horizontal overflow.

`/coa` re-checked after the helper refactor: PDF certificate renders
(1 canvas, 920x1190), image certificate loads, 0 iframes, no ImageKit anchors,
URL unchanged.

## Full suite after both parts

`npx vitest run`: **1774 passed (1774)**, 0 test failures. Two test FILES fail to
collect — `useReturningCustomer.test.ts` and `checkoutPrefill.test.ts` — the known
pre-existing orphans.

One run also reported `App.test.tsx > scrolls the Shop tab...` as failing. It
passes 10/10 in isolation both with and without these changes, and a clean re-run
of the full suite passed it — cross-suite pollution, not a regression here.

`npx tsc --noEmit -p tsconfig.app.json`: no error in any file changed by this work.
`ProtocolGuide.tsx` reports an unused `AlertTriangle` import, which is present on
the baseline too and was left alone.

## Still deliberately not done

Neither page can stop a determined viewer from saving the underlying file — the
browser still fetches the ImageKit URL, so devtools and right-click-save remain.
Closing that needs signed, expiring ImageKit URLs issued by a server endpoint,
which would also fix the private key currently shipped in the public JS bundle
(`src/lib/imagekit.ts` documents this as a known trade-off). What these changes
guarantee is that the product never asks for a download and never navigates a
customer to the CDN.
