# TDD evidence — COA lab reports must be readable on Pure Peps only

**Branch:** `feat/gb-landing-homepage`
**Commits:** `ca5a369` (RED) → `6cf2a3c` (GREEN) → `d7349d5` (refactor)

## Source plan

No `*.plan.md`. The journey was derived from the request: *"is the website still
asking the users to download the coa image or redirect the users to the imagekit
website? i want it to be viewable to my website only."*

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
