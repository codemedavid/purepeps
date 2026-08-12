# Mobile Bottom Navigation Design

## Goal

Replace the storefront's duplicate mobile navigation controls with a persistent bottom navigation based on the approved raised-cart direction. Desktop navigation and non-storefront routes remain unchanged.

## Navigation

The mobile bar contains five destinations:

1. **Home** returns to the storefront menu view and scrolls to the top of the page.
2. **Shop** returns to the storefront menu view and scrolls to the catalog/category navigation.
3. **Cart** opens the existing cart view. It is the raised central action and displays the current item count.
4. **Orders** opens the existing `/track-order` route.
5. **Guides** opens the existing `/protocols` route.

Home and Shop intentionally share the storefront's existing menu view but use different scroll targets. The bar's active state reflects the current local storefront view or route. Checkout keeps Cart active because checkout is part of the cart flow.

## Visual Design

- Render the bar only below the desktop breakpoint (`md`).
- Fix it to the bottom edge, account for `env(safe-area-inset-bottom)`, and use the existing white, cerise, blush, and ink tokens.
- Use Lucide outline icons with visible text labels.
- Raise the central Cart action above the bar in a cerise circle with a restrained shadow.
- Show a compact cart badge capped at `99+`.
- Use cerise icon and label color for the active non-cart destination.
- Give affected storefront layouts enough bottom padding that the fixed bar never covers content or controls.

## Existing UI Changes

- Keep the mobile header logo and brand identity.
- Remove the mobile hamburger and header cart control on the storefront to avoid duplicate navigation.
- Preserve the current desktop header navigation and cart control.
- Hide the floating cart button on mobile and retain it on desktop.
- Keep the category strip and its current sticky/scrolling behavior.

## Component Boundaries

Create a focused `StorefrontBottomNav` component that receives:

- the active storefront view;
- the cart item count;
- callbacks for Home, Shop, and Cart.

Orders and Guides use the application's existing routes. `MainApp` owns view changes and scroll behavior. `Header` receives an option that suppresses storefront-only mobile actions without changing its behavior on standalone pages that already reuse it.

## Accessibility and Interaction

- Use semantic navigation markup and buttons or links as appropriate.
- Provide visible labels and descriptive accessible names.
- Mark the selected destination with `aria-current`.
- Maintain at least 44-by-44-pixel touch targets.
- Include the item count in the Cart accessible label.
- Keep feedback to short color and transform transitions and respect reduced-motion preferences.

## Testing

Add component and integration coverage for:

- all five destinations and their labels;
- Home, Shop, and Cart callbacks;
- Orders and Guides route targets;
- active state, including Cart during checkout;
- zero, normal, and `99+` cart badge behavior;
- the storefront header's suppressed mobile controls without changing desktop behavior;
- mobile hiding and desktop retention of the floating cart button.

Run the relevant Vitest tests, TypeScript build, and lint checks. Existing unrelated failures, if any, must be reported separately rather than folded into this change.

## Out of Scope

- Reworking desktop navigation.
- Adding a user profile or account page.
- Changing category, cart, checkout, order-tracking, or protocol data behavior.
- Redesigning standalone route headers.
