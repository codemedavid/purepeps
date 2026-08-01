import { Suspense, lazy, useCallback, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { usePostHog } from 'posthog-js/react';
import { useCart } from './hooks/useCart';
import Header from './components/Header';
import SubNav from './components/SubNav';
import Menu from './components/Menu';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import GetAccess from './components/GetAccess';
import FloatingCartButton from './components/FloatingCartButton';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import { useAccess } from './hooks/useAccess';
import { useCategories } from './hooks/useCategories';
import { useGroupBuyProgress } from './hooks/useGroupBuyProgress';
import { filterPasaloProducts, partitionCartAvailability } from './utils/groupBuy';
import { isViewOnlyActive } from './utils/groupBuySchedule';

/** How often the storefront re-checks whether a pending view-only gate has lifted. */
const VIEW_ONLY_TICK_MS = 30_000;

// Lazy load route components
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const COA = lazy(() => import('./components/COA'));
const FAQ = lazy(() => import('./components/FAQ'));
const PeptideCalculator = lazy(() => import('./components/PeptideCalculator'));
const OrderTracking = lazy(() => import('./components/OrderTracking'));
const ProtocolGuide = lazy(() => import('./components/ProtocolGuide'));

import { useMenu } from './hooks/useMenu';
// import { useCOAPageSetting } from './hooks/useCOAPageSetting';

function MainApp() {
    const { menuItems, loading: menuLoading } = useMenu();
    const access = useAccess();
    // Verified members get a server-backed cart (survives localStorage eviction
    // and follows them across devices); the catalog rehydrates its references.
    const cart = useCart({ email: access.email, products: menuItems });
    const { freeCategoryIds } = useCategories();
    const groupBuy = useGroupBuyProgress();

    // Single access gate for the whole storefront: a category is orderable when it
    // is free (open to everyone) OR the verified member's tier unlocks it. Threaded
    // to the SubNav, Menu, and Checkout so the UI and the server agree on access.
    const canAccessCategory = useCallback(
        (categoryId: string | null | undefined): boolean =>
            (!!categoryId && freeCategoryIds.has(categoryId)) || access.canAccessCategory(categoryId),
        [freeCategoryIds, access.canAccessCategory],
    );

    // Whether the current cart can be checked out without paid access — i.e. every
    // item sits in a category the shopper can already order (free items for visitors,
    // tier items for members). Lets unverified visitors buy free-only carts.
    const cartAllAccessible =
        cart.cartItems.length > 0 &&
        cart.cartItems.every((item) => canAccessCategory(item.product.category));
    const canCheckoutNow = access.isVerified || cartAllAccessible;
    // While progress is still loading we don't yet know if a batch is open; assume
    // open so we don't flash a "closed" state on first paint. The server trigger is
    // the authoritative gate and the UI corrects once the RPC resolves.
    const isBatchOpen = groupBuy.loading || groupBuy.isBatchOpen;
    const [now, setNow] = useState(() => new Date());
    const [currentView, setCurrentView] = useState<'menu' | 'cart' | 'checkout' | 'access'>('menu');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const handleViewChange = (view: 'menu' | 'cart' | 'checkout' | 'access') => {
        // Checkout needs access — but a cart of only free items can check out
        // without paying. Route to Get Access only when something in the cart is gated.
        const target = view === 'checkout' && !canCheckoutNow ? 'access' : view;
        setCurrentView(target);
        // Scroll to top when changing views
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCategoryClick = (categoryId: string) => {
        setSelectedCategory(categoryId);
    };

    // Filter products based on selected category
    const filteredProducts = selectedCategory === 'all'
        ? menuItems
        : menuItems.filter(item => item.category === selectedCategory);

    // "Pasalo mode" (per open batch): show only capped products that still have
    // remaining slots. Gated on an open batch so no-batch / flag-off / still-loading
    // all fall back to the full catalog (never an empty flash). See groupBuy utils.
    const pasaloOn = !groupBuy.loading && groupBuy.isBatchOpen && (groupBuy.batch?.pasalo_mode ?? false);
    const visibleProducts = pasaloOn
        ? filterPasaloProducts(filteredProducts, groupBuy.items)
        : filteredProducts;

    // "View-only mode" (per open batch): products stay browsable but Add-to-Cart is
    // disabled until the admin flips it off ("allow adding now") — or until the
    // batch's announced start passes, since view-only is a pre-launch phase and the
    // drop going live ends it (isViewOnlyActive). Gated on an open batch so
    // no-batch / flag-off / still-loading never mis-gate. See MenuItemCard.
    const viewOnly = !groupBuy.loading && groupBuy.isBatchOpen && isViewOnlyActive(groupBuy.batch, now);

    // A page left open across the announced start must lift the gate on its own,
    // so tick the clock while — and only while — a view-only gate is still pending.
    const viewOnlyPending = viewOnly && !!groupBuy.batch?.starts_at;
    useEffect(() => {
        if (!viewOnlyPending) return;
        const id = setInterval(() => setNow(new Date()), VIEW_ONLY_TICK_MS);
        return () => clearInterval(id);
    }, [viewOnlyPending]);

    // Only the group-buy-available lines may be checked out — a batch cap that
    // filled up while the item sat in the cart makes it "no longer available", so
    // it is dropped from the order the Checkout screen submits (and its total).
    const availableCartItems = partitionCartAvailability(cart.cartItems, groupBuy.items).available;

    return (
        <div className="min-h-screen bg-white font-inter flex flex-col">
            <Header
                cartItemsCount={cart.getTotalItems()}
                onCartClick={() => handleViewChange('cart')}
                onMenuClick={() => handleViewChange('menu')}
                onGetAccess={() => handleViewChange('access')}
                isVerified={access.isVerified}
            />

            {currentView === 'menu' && (
                <SubNav
                    selectedCategory={selectedCategory}
                    onCategoryClick={handleCategoryClick}
                    isVerified={access.isVerified}
                    canAccessCategory={canAccessCategory}
                />
            )}

            <main className="flex-grow">
                {currentView === 'menu' && (
                    <Menu
                        menuItems={visibleProducts}
                        isLoading={menuLoading}
                        addToCart={cart.addToCart}
                        cartItems={cart.cartItems}
                        updateQuantity={cart.updateQuantity}
                        isVerified={access.isVerified}
                        canAccessCategory={canAccessCategory}
                        tierName={access.tierName}
                        onGetAccess={() => handleViewChange('access')}
                        groupBuyItems={groupBuy.items}
                        isBatchOpen={isBatchOpen}
                        isViewOnly={viewOnly}
                        batchNumber={groupBuy.batch?.batch_number ?? null}
                        batchStartsAt={groupBuy.batch?.starts_at ?? null}
                        batchEndsAt={groupBuy.batch?.ends_at ?? null}
                    />
                )}

                {currentView === 'access' && (
                    <GetAccess
                        onBack={() => handleViewChange('menu')}
                        onVerified={() => handleViewChange('cart')}
                        verifyEmail={access.verifyEmail}
                        watchPendingEmail={access.watchPendingEmail}
                        isVerified={access.isVerified}
                        renewalEmail={access.renewalEmail}
                    />
                )}

                {currentView === 'cart' && (
                    <Cart
                        cartItems={cart.cartItems}
                        updateQuantity={cart.updateQuantity}
                        removeFromCart={cart.removeFromCart}
                        clearCart={cart.clearCart}
                        onContinueShopping={() => handleViewChange('menu')}
                        onCheckout={() => handleViewChange('checkout')}
                        isBatchOpen={isBatchOpen}
                        groupBuyItems={groupBuy.items}
                    />
                )}

                {currentView === 'checkout' && canCheckoutNow && (
                    <Checkout
                        cartItems={availableCartItems}
                        totalPrice={cart.getTotalPrice(availableCartItems)}
                        onBack={() => handleViewChange('cart')}
                        defaultEmail={access.email ?? ''}
                        lockEmail={Boolean(access.email)}
                        canAccessCategory={canAccessCategory}
                        products={menuItems}
                        isBatchOpen={isBatchOpen}
                        batchId={groupBuy.batch?.id ?? null}
                        groupBuyItems={groupBuy.items}
                        onRefreshGroupBuy={groupBuy.refresh}
                    />
                )}
            </main>

            {currentView === 'menu' && (
                <>
                    <FloatingCartButton
                        itemCount={cart.getTotalItems()}
                        onCartClick={() => handleViewChange('cart')}
                    />
                    <Footer />
                </>
            )}
        </div>
    );
}


function PostHogPageviewTracker() {
    const location = useLocation();
    const posthog = usePostHog();

    useEffect(() => {
        if (posthog) {
            posthog.capture('$pageview', {
                $current_url: window.location.href,
            });
        }
    }, [location, posthog]);

    return null;
}

function App() {
    //   const { coaPageEnabled } = useCOAPageSetting();

    return (
        <Router>
            <PostHogPageviewTracker />
            <ErrorBoundary>
                <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                        <Route path="/" element={<MainApp />} />
                        <Route path="/coa" element={<COA />} />
                        <Route path="/faq" element={<FAQ />} />
                        <Route path="/calculator" element={<PeptideCalculator />} />
                        <Route path="/track-order" element={<OrderTracking />} />
                        <Route path="/protocols" element={<ProtocolGuide />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                    </Routes>
                </Suspense>
            </ErrorBoundary>
        </Router>
    );
}

export default App;
