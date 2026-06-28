import { Suspense, lazy, useState, useEffect } from 'react';
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
import { useAccess } from './hooks/useAccess';
import { useGroupBuyProgress } from './hooks/useGroupBuyProgress';

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
    const cart = useCart();
    const { menuItems } = useMenu();
    const access = useAccess();
    const groupBuy = useGroupBuyProgress();
    // While progress is still loading we don't yet know if a batch is open; assume
    // open so we don't flash a "closed" state on first paint. The server trigger is
    // the authoritative gate and the UI corrects once the RPC resolves.
    const isBatchOpen = groupBuy.loading || groupBuy.isBatchOpen;
    const [currentView, setCurrentView] = useState<'menu' | 'cart' | 'checkout' | 'access'>('menu');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const handleViewChange = (view: 'menu' | 'cart' | 'checkout' | 'access') => {
        // Checkout is members-only: route unverified members to Get Access first.
        const target = view === 'checkout' && !access.isVerified ? 'access' : view;
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
                    canAccessCategory={access.canAccessCategory}
                />
            )}

            <main className="flex-grow">
                {currentView === 'menu' && (
                    <Menu
                        menuItems={filteredProducts}
                        addToCart={cart.addToCart}
                        cartItems={cart.cartItems}
                        updateQuantity={cart.updateQuantity}
                        isVerified={access.isVerified}
                        canAccessCategory={access.canAccessCategory}
                        tierName={access.tierName}
                        onGetAccess={() => handleViewChange('access')}
                        groupBuyItems={groupBuy.items}
                        isBatchOpen={isBatchOpen}
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
                        renewalEmail={access.renewalEmail}
                    />
                )}

                {currentView === 'cart' && (
                    <Cart
                        cartItems={cart.cartItems}
                        updateQuantity={cart.updateQuantity}
                        removeFromCart={cart.removeFromCart}
                        clearCart={cart.clearCart}
                        getTotalPrice={cart.getTotalPrice}
                        onContinueShopping={() => handleViewChange('menu')}
                        onCheckout={() => handleViewChange('checkout')}
                        isBatchOpen={isBatchOpen}
                        groupBuyItems={groupBuy.items}
                    />
                )}

                {currentView === 'checkout' && access.isVerified && (
                    <Checkout
                        cartItems={cart.cartItems}
                        totalPrice={cart.getTotalPrice()}
                        onBack={() => handleViewChange('cart')}
                        defaultEmail={access.email ?? ''}
                        lockEmail={Boolean(access.email)}
                        canAccessCategory={access.canAccessCategory}
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
        </Router>
    );
}

export default App;
