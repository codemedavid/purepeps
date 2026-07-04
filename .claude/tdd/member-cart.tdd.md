# TDD Evidence — Access resilience + server-backed member cart

**Source plan:** Derived during this session from a user report — "member had approval, hours later can't access it and the cart is empty." No `*.plan.md` file; journeys were written during the TDD run.

## User journeys

1. As an approved member, I want a momentary network/RPC blip on reload to NOT sign me out, so I keep access I already paid for.
2. As a member who paid but isn't approved yet, I want a blip to NOT forget my pending email, so approval still auto-unlocks.
3. As a verified member, I want my cart to survive a browser storage eviction, so I don't lose my selections.
4. As a verified member on a second device, I want my cart to appear there, merged with anything already in it, so nothing is lost.
5. As the storefront, I must never persist a cart for an unapproved/guessed email, so carts aren't writable via the public anon key.

## Task report

### 1. Access: transient error ≠ rejection (bug fix)
- **Summary:** `get_access_grant` errors were collapsed to `status:'none'`, so the mount re-check deleted the cached verified email; an approved member hitting one blip on reload was silently signed out.
- **Command:** `npx vitest run src/hooks/useAccess.test.ts`
- **RED:** 2 new tests failed — `expected null to be 'member@example.com'` (cache evicted on error).
- **GREEN:** 11/11 pass after adding an `errored` flag to `lookup()` and preserving the cached/pending email on error (with background re-check).
- **Guarantees:** a transient error never evicts a verified or pending email.

### 2. Cart helpers (pure)
- **Summary:** `serializeCart` / `rehydrateCart` / `mergeCarts` / `isValidStoredItem` back the server cart with PII-free references, live-catalog rebuild, and union merge.
- **Command:** `npx vitest run src/utils/cart.test.ts` → **15/15 PASS** (RED first: module missing).
- **Guarantees:** stale/out-of-stock/deleted items dropped, quantity clamped to stock, union keeps max quantity, malformed rows rejected.

### 3. member_carts table + approval-gated RPCs
- **Summary:** `member_carts` (RLS on, no policies) + `get_member_cart` / `save_member_cart` (SECURITY DEFINER), each requiring `get_access_status = 'approved'`; `save` sanitizes every row server-side.
- **Validation:** live round-trip via Supabase MCP `execute_sql` — unapproved `save` raised `not approved for the open batch`; approved `save` of a 6-row payload persisted only the 2 well-formed rows (empty-id, qty 0, non-string variation, qty 1.5 dropped); test row deleted after.
- **Advisor:** `get_advisors(security)` — only `rls_enabled_no_policy` (INFO) for `member_carts`, which is the intended lockdown. No new WARN/ERROR.

### 4. useCart server sync (union merge)
- **Summary:** `useCart({ email, products })` loads + unions the server cart on verify, mirrors changes back (debounced), and makes zero server calls while unverified.
- **Command:** `npx vitest run src/hooks/useCart.server.test.ts` → **5/5 PASS** (RED first: 4/5 failed before impl).

## Test specification

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Transient RPC error keeps the cached verified email | `useAccess.test.ts:keeps the cached verified email when the RPC errors on mount` | unit | PASS |
| 2 | Transient RPC error keeps watching the pending email | `useAccess.test.ts:keeps watching a pending email when the RPC errors on mount` | unit | PASS |
| 3 | Server cart stores references only, no snapshot | `cart.test.ts:serializeCart` | unit | PASS |
| 4 | Rehydrate rebuilds from live catalog, drops stale/OOS, clamps to stock | `cart.test.ts:rehydrateCart` | unit | PASS |
| 5 | Union merge keeps max quantity, never loses a line | `cart.test.ts:mergeCarts` | unit | PASS |
| 6 | Malformed stored rows rejected | `cart.test.ts:isValidStoredItem` | unit | PASS |
| 7 | Unverified shopper triggers no server calls | `useCart.server.test.ts:never touches the server while unverified` | unit | PASS |
| 8 | Verify loads + unions server cart | `useCart.server.test.ts:loads and unions the server cart when a member is verified` | unit | PASS |
| 9 | Same line both sides → higher quantity | `useCart.server.test.ts:keeps the higher quantity...` | unit | PASS |
| 10 | Cart change persists to server | `useCart.server.test.ts:persists to the server when the cart changes` | unit | PASS |
| 11 | Clear clears the server cart | `useCart.server.test.ts:clears the server cart when the cart is cleared` | unit | PASS |
| 12 | Unapproved email cannot save; malformed rows dropped | Supabase MCP `execute_sql` round-trip | integration | PASS |

## Coverage and known gaps

- Full suite: **633 passed / 633** (`npx vitest run`); **`tsc --noEmit` clean**.
- No coverage-threshold run configured in this repo; new modules are directly covered by the tests above.
- **Known gaps / follow-ups:**
  - No E2E (Playwright) test for the cross-device flow — asserted at the hook + SQL layers only.
  - Server security is convenience-grade: the cart key is an approved email, which is guessable. Data is non-PII (catalog ids + quantities). Documented in the migration header.
  - Cart merge strategy is fixed to **union / max-quantity** per the user's choice.
