# TDD Evidence — Group-buy admin exports (members + items-per-kit)

## Source plan

No `*.plan.md` was supplied. User journeys were derived during this TDD run from the
feature request: export members with their orders/total/payment-proof image link, and
export total orders of items per kit (product + variation) on one sheet — all as
CSV that opens in Excel / Google Sheets.

## User journeys

1. As a group-buy admin, I want to download every member with their orders, running
   total, and a link to each payment-proof image, so I can reconcile who paid what
   outside the app (Excel / Sheets / CSV).
2. As a group-buy admin, I want to download the total units ordered per product *and*
   variation (e.g. "Tirzepatide 15mg → 30 vials / 3 kits") on one sheet, so I can place
   the supplier order per kit.

## Task report

### Pure export builders (`src/utils/batchExports.ts`)

- Summary: added `flattenProductVariations`, `buildItemsByVariationCsv`, and
  `buildMembersExportCsv`; extracted shared RFC-4180 CSV primitives into
  `src/utils/csv.ts` and refactored `batchCloseoutExport.ts` to reuse them (DRY).
- RED: `npx vitest run src/utils/batchExports.test.ts` → failed to resolve
  `./batchExports` (module did not exist) — "no tests" / 1 failed file.
- GREEN: same command → **11 passed**.
- Guarantees: units aggregate per product+variation excluding cancelled orders; kits
  rendered via `formatKits` (10 vials/kit, one-decimal for partials); members export is
  one row per order sorted by email then created_at, with a non-cancelled member total
  repeated per row and each order's payment-proof + extra-proof URLs.

### Browser download helper (`src/utils/downloadCsv.ts`)

- Summary: isolated Blob-download side effect (UTF-8 BOM so Excel renders ₱/accents).
- RED→GREEN: `npx vitest run src/utils/downloadCsv.test.ts` → **2 passed** (createObjectURL
  stubbed under jsdom; asserts anchor filename/click + object-URL revoke).

### UI wiring (closeout + members panels)

- Summary: "Items CSV" download button on `BatchCloseoutPanel`; "Export orders" button on
  `BatchMembersPanel` (shown only when orders are provided); `orders`/`batchNumber` passed
  down from `GroupBuyManager` and `BatchOverviewTab`.
- GREEN: `npx vitest run …/BatchCloseoutPanel.test.tsx …/BatchMembersPanel.test.tsx`
  → **21 passed** (includes new download-trigger tests).

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Units aggregate per product+variation, cancelled excluded | `batchExports.test.ts:flattenProductVariations` | unit | PASS | `vitest run src/utils/batchExports.test.ts` |
| 2 | Items sheet emits header, per-variation kit rows, totals row | `batchExports.test.ts:buildItemsByVariationCsv` | unit | PASS | same |
| 3 | Members CSV = one row/order, per-member total + proof link | `batchExports.test.ts:buildMembersExportCsv` | unit | PASS | same |
| 4 | Cancelled orders excluded from member total but still listed | `batchExports.test.ts:excludes cancelled…` | unit | PASS | same |
| 5 | Download helper names/clicks anchor and revokes URL | `downloadCsv.test.ts` | unit | PASS | `vitest run src/utils/downloadCsv.test.ts` |
| 6 | "Items CSV" button triggers a CSV download | `BatchCloseoutPanel.test.tsx` | component | PASS | `vitest run …/BatchCloseoutPanel.test.tsx` |
| 7 | "Export orders" hidden without orders; downloads when present | `BatchMembersPanel.test.tsx` | component | PASS | `vitest run …/BatchMembersPanel.test.tsx` |

## Coverage and known gaps

- Full suite: `npx vitest run` → **60 files / 718 tests passed**. Typecheck `tsc --noEmit`
  clean; `npm run build` succeeds.
- `npm run lint` / `npx eslint` is broken **repo-wide** (pre-existing): ESLint 9 fails
  loading `@typescript-eslint/no-unused-expressions` (`allowShortCircuit` undefined) — a
  dependency version mismatch, reproducible on untouched files. Not introduced here.
- No E2E added; the download path is exercised via jsdom component tests (real file-save
  dialogs can't run headless).
