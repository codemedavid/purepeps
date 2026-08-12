# Mobile Bottom Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-only Home, Shop, raised Cart, Orders, and Guides navigation bar without changing desktop or standalone-page navigation.

**Architecture:** A focused `StorefrontBottomNav` owns semantics, responsive styling, badge formatting, and active-state derivation. `MainApp` remains the source of truth for storefront views and supplies Home, Shop, and Cart actions; `Header` gets one opt-in suppression prop, while `FloatingCartButton` becomes desktop-only.

**Tech Stack:** React 18, TypeScript, React Router, Lucide React, Tailwind CSS, Vitest, Testing Library

---

## File Map

- Create `src/components/StorefrontBottomNav.tsx`: mobile navigation and active states.
- Create `src/components/StorefrontBottomNav.test.tsx`: destinations, callbacks, badge, and accessibility.
- Create `src/components/Header.test.tsx`: storefront suppression and default-behavior regression coverage.
- Create `src/components/FloatingCartButton.test.tsx`: empty and responsive visibility coverage.
- Modify `src/components/Header.tsx`: suppress duplicate mobile controls only when requested.
- Modify `src/components/FloatingCartButton.tsx`: preserve the control only at `md` and wider.
- Modify `src/App.tsx`: render and connect the bar, scroll targets, and safe-area spacing.

### Task 1: Build the Bottom Navigation With TDD

**Files:**
- Create: `src/components/StorefrontBottomNav.tsx`
- Create: `src/components/StorefrontBottomNav.test.tsx`

- [ ] **Step 1: Write failing destination and callback tests**

Create `src/components/StorefrontBottomNav.test.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import StorefrontBottomNav from './StorefrontBottomNav';

function renderNav(overrides: Partial<ComponentProps<typeof StorefrontBottomNav>> = {}) {
  const props = {
    activeView: 'menu' as const,
    menuDestination: 'home' as const,
    cartItemCount: 0,
    onHome: vi.fn(),
    onShop: vi.fn(),
    onCart: vi.fn(),
    ...overrides,
  };
  render(<MemoryRouter><StorefrontBottomNav {...props} /></MemoryRouter>);
  return props;
}

describe('StorefrontBottomNav', () => {
  it('renders the approved destinations and route targets', () => {
    renderNav();
    expect(screen.getByRole('navigation', { name: 'Storefront' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/track-order');
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/protocols');
  });

  it('dispatches Home, Shop, and Cart actions', async () => {
    const props = renderNav({ cartItemCount: 3 });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Shop' }));
    await user.click(screen.getByRole('button', { name: 'Cart, 3 items' }));
    expect(props.onHome).toHaveBeenCalledOnce();
    expect(props.onShop).toHaveBeenCalledOnce();
    expect(props.onCart).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the new test and verify the expected failure**

Run: `npm test -- src/components/StorefrontBottomNav.test.tsx`

Expected: FAIL because `./StorefrontBottomNav` does not exist.

- [ ] **Step 3: Add failing active-state and badge tests**

Append:

```tsx
it.each([
  ['menu', 'home', 'Home'],
  ['menu', 'shop', 'Shop'],
  ['cart', 'home', 'Cart, 0 items'],
  ['checkout', 'shop', 'Cart, 0 items'],
] as const)('marks %s/%s as %s current', (activeView, menuDestination, name) => {
  renderNav({ activeView, menuDestination });
  expect(screen.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
});

it('hides a zero badge and caps a large badge at 99+', () => {
  const { rerender } = render(
    <MemoryRouter><StorefrontBottomNav activeView="menu" menuDestination="home" cartItemCount={0} onHome={vi.fn()} onShop={vi.fn()} onCart={vi.fn()} /></MemoryRouter>,
  );
  expect(screen.queryByTestId('bottom-nav-cart-badge')).not.toBeInTheDocument();
  rerender(
    <MemoryRouter><StorefrontBottomNav activeView="menu" menuDestination="home" cartItemCount={120} onHome={vi.fn()} onShop={vi.fn()} onCart={vi.fn()} /></MemoryRouter>,
  );
  expect(screen.getByTestId('bottom-nav-cart-badge')).toHaveTextContent('99+');
  expect(screen.getByRole('button', { name: 'Cart, 120 items' })).toBeInTheDocument();
});
```

- [ ] **Step 4: Implement the minimal accessible component**

Create `src/components/StorefrontBottomNav.tsx`:

```tsx
import type { ReactNode } from 'react';
import { BookOpen, House, Package, ShoppingBag, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';

export type StorefrontView = 'menu' | 'cart' | 'checkout' | 'access';
export type MenuDestination = 'home' | 'shop';

interface Props {
  activeView: StorefrontView;
  menuDestination: MenuDestination;
  cartItemCount: number;
  onHome: () => void;
  onShop: () => void;
  onCart: () => void;
}

const itemClass = (active: boolean) =>
  `relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors motion-reduce:transition-none ${active ? 'text-sakura-primary' : 'text-sakura-faint hover:text-sakura-deep'}`;

function Label({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <>{icon}<span>{children}</span></>;
}

export default function StorefrontBottomNav({ activeView, menuDestination, cartItemCount, onHome, onShop, onCart }: Props) {
  const homeActive = activeView === 'menu' && menuDestination === 'home';
  const shopActive = activeView === 'menu' && menuDestination === 'shop';
  const cartActive = activeView === 'cart' || activeView === 'checkout';
  const visibleCount = cartItemCount > 99 ? '99+' : cartItemCount;

  return (
    <nav aria-label="Storefront" className="fixed inset-x-0 bottom-0 z-[55] grid grid-cols-5 border-t border-sakura-edge bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(30,14,22,0.08)] backdrop-blur-xl md:hidden">
      <button type="button" onClick={onHome} aria-current={homeActive ? 'page' : undefined} className={itemClass(homeActive)}><Label icon={<House aria-hidden className="h-5 w-5" />}>Home</Label></button>
      <button type="button" onClick={onShop} aria-current={shopActive ? 'page' : undefined} className={itemClass(shopActive)}><Label icon={<ShoppingBag aria-hidden className="h-5 w-5" />}>Shop</Label></button>
      <button type="button" onClick={onCart} aria-current={cartActive ? 'page' : undefined} aria-label={`Cart, ${cartItemCount} ${cartItemCount === 1 ? 'item' : 'items'}`} className="relative -translate-y-5 flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-sakura-primary motion-reduce:transform-none">
        <span className="relative grid h-12 w-12 place-items-center rounded-full bg-sakura-primary text-white shadow-[0_8px_18px_rgba(214,68,111,0.32)] transition-transform active:scale-95 motion-reduce:transition-none">
          <ShoppingCart aria-hidden className="h-6 w-6" />
          {cartItemCount > 0 && <span data-testid="bottom-nav-cart-badge" className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-sakura-ink px-1 text-[9px] font-bold text-white">{visibleCount}</span>}
        </span>
        <span>Cart</span>
      </button>
      <Link to="/track-order" className={itemClass(false)}><Label icon={<Package aria-hidden className="h-5 w-5" />}>Orders</Label></Link>
      <Link to="/protocols" className={itemClass(false)}><Label icon={<BookOpen aria-hidden className="h-5 w-5" />}>Guides</Label></Link>
    </nav>
  );
}
```

- [ ] **Step 5: Run tests and commit the component slice**

Run: `npm test -- src/components/StorefrontBottomNav.test.tsx`

Expected: PASS.

```bash
git add src/components/StorefrontBottomNav.tsx src/components/StorefrontBottomNav.test.tsx
git commit -m "feat: add storefront bottom navigation"
```

### Task 2: Remove Duplicate Mobile Controls With TDD

**Files:**
- Modify: `src/components/Header.tsx:4-13,83-128`
- Create: `src/components/Header.test.tsx`
- Modify: `src/components/FloatingCartButton.tsx:12-30`
- Create: `src/components/FloatingCartButton.test.tsx`

- [ ] **Step 1: Write failing Header behavior tests**

Create `src/components/Header.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Header from './Header';

const props = { cartItemsCount: 2, onCartClick: vi.fn(), onMenuClick: vi.fn(), onGetAccess: vi.fn(), isVerified: false };

describe('Header', () => {
  it('keeps reusable mobile controls by default', () => {
    render(<Header {...props} />);
    expect(screen.getByRole('button', { name: 'View cart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
  });

  it('suppresses storefront mobile duplicates but retains desktop cart markup', () => {
    render(<Header {...props} hideMobileStorefrontActions />);
    expect(screen.queryByRole('button', { name: 'Toggle menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View cart' })).toHaveClass('hidden', 'md:block');
  });
});
```

- [ ] **Step 2: Run the Header test and verify it fails**

Run: `npm test -- src/components/Header.test.tsx`

Expected: FAIL because the cart lacks its accessible name and the new prop is not defined.

- [ ] **Step 3: Add the accessible name and suppression prop**

Extend `HeaderProps` with `hideMobileStorefrontActions?: boolean`, default it to `false`, add `aria-label="View cart"` to the cart button, and apply the conditional class:

```tsx
className={`relative p-2.5 text-sakura-ink hover:bg-sakura-blush-soft rounded-xl transition-colors ${hideMobileStorefrontActions ? 'hidden md:block' : ''}`}
```

Render the hamburger only inside `{!hideMobileStorefrontActions && (...)}` and guard the drawer with `{!hideMobileStorefrontActions && mobileMenuOpen && (...)}`. Do not change desktop links or standalone callers.

- [ ] **Step 4: Write the floating-cart visibility tests**

Create `src/components/FloatingCartButton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FloatingCartButton from './FloatingCartButton';

describe('FloatingCartButton', () => {
  it('renders nothing for an empty cart', () => {
    render(<FloatingCartButton itemCount={0} onCartClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'View cart' })).not.toBeInTheDocument();
  });

  it('is hidden on mobile and retained from md upward', () => {
    render(<FloatingCartButton itemCount={2} onCartClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'View cart' })).toHaveClass('hidden', 'md:block');
  });
});
```

- [ ] **Step 5: Make the floating cart desktop-only**

Prepend `hidden md:block` to the existing button class in `src/components/FloatingCartButton.tsx`. Preserve its empty-cart early return, click behavior, tooltip, and desktop offsets.

- [ ] **Step 6: Run both test files and commit**

Run: `npm test -- src/components/Header.test.tsx src/components/FloatingCartButton.test.tsx`

Expected: PASS.

```bash
git add src/components/Header.tsx src/components/Header.test.tsx src/components/FloatingCartButton.tsx src/components/FloatingCartButton.test.tsx
git commit -m "refactor: remove duplicate mobile storefront controls"
```

### Task 3: Connect the Bar to MainApp

**Files:**
- Modify: `src/App.tsx:1-20,65-80,116-209`

- [ ] **Step 1: Add typed destination state**

Import the component and types, then replace the inline view union:

```tsx
import StorefrontBottomNav, { type MenuDestination, type StorefrontView } from './components/StorefrontBottomNav';

const [currentView, setCurrentView] = useState<StorefrontView>('menu');
const [menuDestination, setMenuDestination] = useState<MenuDestination>('home');
```

- [ ] **Step 2: Add distinct Home and Shop handlers**

```tsx
const handleHomeClick = () => {
  setMenuDestination('home');
  setCurrentView('menu');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleShopClick = () => {
  setMenuDestination('shop');
  setCurrentView('menu');
  window.requestAnimationFrame(() => {
    document.getElementById('storefront-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
};
```

Use `handleHomeClick` for the header logo. Use `handleShopClick` for Cart's Continue Shopping action. Keep access and guarded checkout on `handleViewChange`.

- [ ] **Step 3: Add the scroll target, responsive opt-out, safe-area spacing, and nav**

Apply `pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0` to the root storefront div. Pass `hideMobileStorefrontActions` to `Header`. Wrap the menu-only `SubNav` in `<div id="storefront-catalog">`. Render this immediately before the closing root div:

```tsx
<StorefrontBottomNav
  activeView={currentView}
  menuDestination={menuDestination}
  cartItemCount={cart.getTotalItems()}
  onHome={handleHomeClick}
  onShop={handleShopClick}
  onCart={() => handleViewChange('cart')}
/>
```

- [ ] **Step 4: Run focused integration regressions**

Run:

```bash
npm test -- src/components/StorefrontBottomNav.test.tsx src/components/Header.test.tsx src/components/FloatingCartButton.test.tsx src/components/Cart.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the integration**

```bash
git add src/App.tsx
git commit -m "feat: wire mobile bottom navigation into storefront"
```

### Task 4: Verify the Finished Change

**Files:**
- Verify only; do not modify unrelated dirty files.

- [ ] **Step 1: Run the complete automated checks**

Run `npm test`, then `npm run lint`, then `npm run build`.

Expected: all commands exit 0. If the baseline contains an unrelated failure, rerun the focused navigation tests and report that unrelated failure separately.

- [ ] **Step 2: Perform a responsive smoke check**

Run `npm run dev` and verify at phone width and at `md` or wider:

- mobile shows Home, Shop, raised Cart, Orders, and Guides without hamburger or header cart;
- Home scrolls to top and Shop to the category strip;
- Cart opens the cart, reports the correct badge, and stays active during checkout;
- Orders opens `/track-order`, Guides opens `/protocols`, and the bar clears the safe area;
- desktop retains existing header links, header cart, and floating cart with no bottom bar.

- [ ] **Step 3: Check scope and whitespace**

Run `git diff --check HEAD~3..HEAD` and `git status --short`.

Expected: no whitespace errors. The user's unrelated `GroupBuyManager`, `useGroupBuy`, migration, and migration-test changes remain untouched.
