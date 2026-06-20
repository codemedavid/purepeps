# TDD Evidence — Group Buy Admin Redesign

**Date:** 2026-06-20
**Branch:** main
**Scope:** Redesign the Group Buy management page into a tabbed "command center" with
better UI/UX so the admin can manage everything easily. No `*.plan.md` was supplied;
journeys were derived during this TDD run from the user request and a clarifying round
(chosen direction: **tabbed command center** layout + **in-app modals** replacing native
`window.prompt` / `window.confirm`).

## User journeys

1. As an admin, I want an at-a-glance KPI summary of the selected batch (orders, revenue,
   to-confirm, paid) so I can gauge batch health instantly.
2. As an admin, I want to navigate management via tabs (Overview / Orders / Items & Caps /
   Shipping / History) so I don't scroll one long page.
3. As an admin, I want a header batch switcher so I can jump between batches fast.
4. As an admin, I want to open a batch via an in-app form with inline validation instead of
   native browser prompts.
5. As an admin, I want destructive / lifecycle actions to use clear in-app confirm dialogs.
6. As an admin, I want to search orders by name / number / email / phone / item.
7. As an admin, I want the overview to surface orders that need action (new → confirm).

## RED → GREEN cycle

Every production change below was preceded by a failing test (runtime RED for the pure utils
and component behavior; compile-time RED where a new prop/type was referenced before it
existed), then implemented to GREEN. Validation command throughout: `npx vitest run <file>`.

| Stage | Target | RED evidence | GREEN evidence |
|-------|--------|--------------|----------------|
| 1 | `src/utils/groupBuyOverview.ts` | `vitest run groupBuyOverview.test.ts` → "1 failed (no tests)" (module missing) | 23/23 pass |
| 2 | `ConfirmDialog`, `OpenBatchModal`, `BatchKpiStrip` | 3 files "no tests" (modules missing) | 17/17 pass (after fixing native min-validation swallowing custom error, and keeping a stable confirm-button label while busy) |
| 3 | `GroupBuyTabs`, `BatchSwitcher` | 2 files "no tests" | 8/8 pass |
| 3 | `BatchLifecycleBar` confirm routing | 2 failed (used `window.confirm`, ignored `requestConfirm`) | 3/3 pass |
| 3 | `BatchOverviewTab` | module missing | 3/3 pass |
| 4 | `BatchOrdersPanel` search + bulk-confirm routing | 2 failed (no `searchbox`; bulk used `window.confirm`) | 2/2 pass |

## Test specification (human-readable guarantees)

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | KPIs exclude cancelled from active/paid/revenue/units; count new + claims | `groupBuyOverview.test.ts > computeBatchKpis` | unit | PASS |
| 2 | Cap-fill aggregates caps/reserved, counts full products, clamps to 100% | `groupBuyOverview.test.ts > summarizeCapFill` | unit | PASS |
| 3 | Needs-action returns only `new` orders, oldest first | `groupBuyOverview.test.ts > ordersNeedingAction` | unit | PASS |
| 4 | Order search matches number/name/email/phone/item, combines with status, trims, is case-insensitive | `groupBuyOverview.test.ts > filterBatchOrders` | unit | PASS |
| 5 | ConfirmDialog is an accessible modal; confirm/cancel/Escape wire correctly; disabled while busy | `ConfirmDialog.test.tsx` | component | PASS |
| 6 | OpenBatchModal trims name→null, defaults/validates access fee (blank→null, negative→error) | `OpenBatchModal.test.tsx` | component | PASS |
| 7 | KPI strip renders accessible labelled tiles with compact peso revenue | `BatchKpiStrip.test.tsx` | component | PASS |
| 8 | Tabs are an accessible tablist with selected state, change + badges | `GroupBuyTabs.test.tsx` | component | PASS |
| 9 | Batch switcher shows/opens/selects and closes; empty placeholder | `BatchSwitcher.test.tsx` | component | PASS |
| 10 | Lifecycle actions route through the confirm dialog (danger tone for Close); open-batch is direct | `BatchLifecycleBar.test.tsx` | component | PASS |
| 11 | Overview surfaces the to-confirm queue, opens an order, shows all-caught-up + cap fill | `BatchOverviewTab.test.tsx` | component | PASS |
| 12 | Orders panel search filters; bulk apply routes through the confirm dialog | `BatchOrdersPanel.test.tsx` | component | PASS |

## Adversarial review + fixes

A background multi-agent workflow reviewed the 12 changed files across four lenses
(React correctness, accessibility, TypeScript, UX), and **independently verified every
finding against the real code** before reporting. It confirmed **28 in-scope findings**.

**Fixed (24):**

- **HIGH — data loss:** `OpenBatchModal` reset the form on *any* parent re-render (the
  effect mixed form-reset with the keydown listener and depended on a non-memoized
  `onCancel`); refocusing the window mid-type wiped the batch name/fee. Split the concerns
  into a new shared `useDialogA11y` hook so reset runs only on open.
- **HIGH — payment desync:** bulk "Confirmed" (`bulkUpdateStatus`) and the order-detail
  status dropdown could move an order to `confirmed` **without** marking it paid, unlike the
  single-order Confirm. Both now mark `payment_status: 'paid'` consistently (still no stock
  deduction — pre-orders against the cap).
- **A11y:** focus trap + focus-return + Escape for both modals (`useDialogA11y`); WAI-ARIA
  tabs (roving tabindex, arrow/Home/End keys, `aria-controls` + `role="tabpanel"`); batch
  switcher menu keyboard nav + label; aria-labels on the back button, status select, tracking
  inputs, bulk-status select; `role="group"`/`aria-pressed` on filter chips; `role="progressbar"`
  on the cap bar; contrast fixes on KPI hints and the active-tab badge.
- **UX:** "Caps at a glance" no longer shows a previous batch's stale numbers on a
  closed/finalized batch; the Orders count is consistent between the KPI tile and tab badge;
  empty search/filter state offers a "Clear search and filters" escape.
- **Quality:** memoized per-status chip counts; honest nullable type on `itemsSummary`.

**Deferred (4, intentional):** allowing *backward* status transitions (kept flexible so an
admin can correct mistakes — the unsafe paid-marking part was fixed); keeping the confirm
dialog open until its async action resolves (busy-guard + trap added instead); a loading
skeleton for caps during refetch; a success toast after "Save tracking".

## Verification commands & results

- `npx vitest run` → **27 files, 309 tests passing** (baseline was 17 files / 250; +59 new
  tests, incl. a `BatchOrderDetail` regression test locking the confirm-routing fix).
- `npx tsc --noEmit` → clean (no type errors), before and after the review fixes.
- `npx vite build` → succeeds (pre-existing >500 kB chunk-size warning, unrelated).

## Known gaps

- **ESLint cannot run** in this environment: `@typescript-eslint/no-unused-expressions` throws
  `Cannot read properties of undefined (reading 'allowShortCircuit')` on *every* file,
  including untouched `src/main.tsx` — a pre-existing ESLint/plugin version mismatch, not
  introduced by this work.
- `GroupBuyManager` (the container) is covered by typecheck + build + its now-tested child
  components rather than a dedicated integration test (its hooks require broad Supabase mocking).
- Coverage thresholds are not configured in `vitest.config.ts`; the new pure util has 23
  direct unit tests covering all branches.
