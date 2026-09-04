# TDD Evidence: in-site protocol file viewer

**Source plan:** none on disk — journeys were derived during the `/ecc:plan` run
that preceded this cycle (conversational mode).
**Branch:** `feat/pay-now-cod-payment-options`
**Commits:** `f40550a` (RED) → `f9fd662` (GREEN)

## Problem

On the Peptide Protocols page, a protocol whose `content_type` is `file`
rendered its card as `<a href={file_url} target="_blank">`. Tapping it left
Pure Peps entirely and landed the customer on `ik.imagekit.io` — a bare CDN
page with no header, no bottom nav and no route back to the store.

## User journeys

1. As a customer on my phone, I want to tap a protocol file and read it on the
   Pure Peps page, so I'm never dumped onto an unfamiliar ImageKit URL.
2. As a customer, I want an explicit Download action inside that viewer, so I
   can still save the protocol to my device.
3. As a customer, I want to close the viewer and land back where I was in the
   protocol list.
4. As a customer opening a file the browser cannot draw, I want a clear message
   plus a working download, never a blank box.

## Findings that shaped the design

Checked against the live asset before writing code
(`https://ik.imagekit.io/vmgfsnjfe/protocol-files/1783219261423-4pw7tok3mc5.pdf`,
the only `content_type = 'file'` row in production):

| Question | Result | Consequence |
|---|---|---|
| Can ImageKit rasterise the PDF server-side? | `?tr=f-jpg,pg-1` returned the raw PDF, same etag and `content-type: application/pdf` | Server-side page images ruled out |
| Can the browser fetch it cross-origin? | `access-control-allow-origin: *` | pdf.js can read it |
| Does `?ik-attachment=true` force a save? | `content-disposition: attachment` | Download works despite `download` being ignored cross-origin |
| Is an `<iframe>`/`<object>` embed enough? | No — Chrome on Android will not render PDFs in an iframe, iOS Safari shows only page 1 | pdf.js chosen; phones are the actual audience |

## Task report

### Task 1 — URL helpers (`src/utils/protocolFiles.ts`)

Pure functions deciding what can be previewed and how to force a download.

- **RED:** `npx vitest run src/utils/protocolFiles.test.ts` →
  `Failed to resolve import "./protocolFiles"`, `Test Files 1 failed`.
- **GREEN:** same command → `Test Files 1 passed`, `Tests 10 passed (10)`.
- **Guarantees:** PDFs are previewable regardless of letter case or query
  string; office documents and extension-less URLs are not; ImageKit URLs gain
  `ik-attachment=true` exactly once and non-ImageKit URLs are left untouched.

### Task 2 — pdf.js adapter (`src/lib/pdf.ts`)

A single seam over `pdfjs-dist` (legacy build, for older Android/iOS), imported
dynamically by the viewer.

- **Not unit-tested by design:** jsdom has no canvas rasteriser, so a test here
  would assert the mock rather than the rendering. It is covered indirectly —
  the production build proves the module and its worker resolve, and the viewer
  tests prove every call the app makes into it.
- **Evidence:** `npx vite build` → `✓ built in 6.44s`, emitting
  `dist/assets/pdf-4wyLWTP9.js  408.78 kB │ gzip: 123.12 kB` as its own chunk
  plus `dist/assets/pdf.worker.min-rsCePomN.mjs`. The `/protocols` entry chunk
  stayed at `14.01 kB │ gzip: 4.12 kB`, so the PDF machinery only downloads when
  a customer actually opens a file.

### Task 3 — The viewer (`src/components/ProtocolFileViewer.tsx`)

- **RED:** `npx vitest run src/components/ProtocolFileViewer.test.tsx` →
  `Failed to resolve import "./ProtocolFileViewer"`.
- **GREEN:** same command → `Tests 12 passed (12)`.

### Task 4 — Wiring into the page (`src/components/ProtocolGuide.tsx`)

The card became a `<button>` that opens the viewer; the anchor to the file host
is gone.

- **RED:** `npx vitest run src/components/ProtocolGuide.test.tsx` →
  `Tests 3 failed | 17 passed (20)`; the three failures were the new
  in-site-viewer expectations.
- **GREEN:** same command → `Tests 20 passed (20)`.

## Test specification

| # | What is guaranteed | Test file or command | Type | Result |
|---|--------------------|----------------------|------|--------|
| 1 | A PDF URL is recognised as previewable, whatever its case or query string | `src/utils/protocolFiles.test.ts:isPreviewableFile` | unit | PASS |
| 2 | An office document or extension-less URL is not treated as previewable | `src/utils/protocolFiles.test.ts:isPreviewableFile` | unit | PASS |
| 3 | ImageKit URLs get `ik-attachment=true` once; other hosts are untouched | `src/utils/protocolFiles.test.ts:toDownloadUrl` | unit | PASS |
| 4 | The file opens as a modal dialog titled with the protocol name | `ProtocolFileViewer.test.tsx:presents the protocol as a dialog titled with its name` | unit | PASS |
| 5 | A loading state shows until the document arrives | `ProtocolFileViewer.test.tsx:shows a loading state until the document arrives` | unit | PASS |
| 6 | Every page of the PDF is drawn, labelled "Page n of N" | `ProtocolFileViewer.test.tsx:draws one page per page of the PDF` | unit | PASS |
| 7 | Each page canvas is handed to the renderer, in page order | `ProtocolFileViewer.test.tsx:hands each page canvas to the renderer` | unit | PASS |
| 8 | The document is loaded from the protocol's own file URL | `ProtocolFileViewer.test.tsx:loads the document from the protocol file URL` | unit | PASS |
| 9 | Download points at the attachment URL, so the file saves | `ProtocolFileViewer.test.tsx:offers a download that ImageKit serves as an attachment` | unit | PASS |
| 10 | The viewer closes on the close button, on Escape, and on backdrop click | `ProtocolFileViewer.test.tsx:closes on…` (3 tests) | unit | PASS |
| 11 | Clicking the document itself does not close the viewer | `ProtocolFileViewer.test.tsx:stays open when the document itself is clicked` | unit | PASS |
| 12 | A failed load explains itself and still offers the download | `ProtocolFileViewer.test.tsx:explains a failed render and still offers the download` | unit | PASS |
| 13 | An undrawable file type shows a message, not a blank box, and never calls pdf.js | `ProtocolFileViewer.test.tsx:never leaves a blank box for a file type it cannot draw` | unit | PASS |
| 14 | The expanded file card renders no anchor to the file host | `ProtocolGuide.test.tsx:keeps the customer on Pure Peps instead of linking out to the file host` | integration | PASS |
| 15 | Clicking the card opens the in-site viewer for that protocol | `ProtocolGuide.test.tsx:opens the file in an in-site viewer when the card is clicked` | integration | PASS |
| 16 | Closing the viewer returns to the protocol list | `ProtocolGuide.test.tsx:returns to the protocol list when the viewer is closed` | integration | PASS |

Totals: 42 passing tests across the three suites.

## Coverage and known gaps

- **No coverage number.** This repo has no coverage tooling installed
  (`@vitest/coverage-v8` is absent and there is no `test:coverage` script), and
  adding a dependency was outside the scope of this fix. The 80% target is
  therefore unverified for this change; the specification table above is the
  substitute evidence.
- **`src/lib/pdf.ts` has no direct unit test** — see Task 2 for why, and for the
  build evidence that stands in for it.
- **No browser screenshot.** The chrome-devtools MCP profile was locked by an
  orphaned Chrome instance from a previous session, and killing a window that
  might belong to the user was not worth the screenshot. Real-device checks
  still worth doing: open a protocol file on an actual Android phone and an
  actual iPhone, since sidestepping their broken in-iframe PDF handling is the
  entire reason pdf.js is here.
- **Only PDFs are previewable.** `ProtocolManager` still accepts
  `.doc/.docx/.txt/.xls/.xlsx`; those fall through to the honest "Preview isn't
  available" state plus a download. No such file exists in production today.
- **Image protocols are unchanged** — they already render inline on the page and
  were deliberately left alone.

## Merge evidence

If these commits are squashed, preserve:

- **RED** `f40550a` — `protocolFiles` and `ProtocolFileViewer` unresolved;
  `ProtocolGuide.test.tsx` 3 failed | 17 passed.
- **GREEN** `f9fd662` — 10 + 12 + 20 passing; `vite build` clean with the pdf
  chunk split out; `tsc -p tsconfig.app.json` at 101 pre-existing errors, down
  from 104 on `HEAD` (none introduced).
- **Refactor** — none needed; the GREEN implementation was already the shape
  worth keeping.
