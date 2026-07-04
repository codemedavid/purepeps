import React, { useCallback, useState } from 'react';
import { Search, Package, Truck, CheckCircle, Clock, AlertCircle, ArrowRight, ExternalLink, ArrowLeft, Gift, Upload, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrderHistory } from '../hooks/useOrderHistory';
import { useImageUpload } from '../hooks/useImageUpload';
import posthog from '../lib/posthog';
import { computeTrackingStep, TRACKING_STEPS, orderStatusLabel, sequenceBundleOrders, groupBundlesByRoot } from '../utils/orderTracking';
import type { OrderBundleRow } from '../types';
import LeftoverClaimPanel from './groupbuy/LeftoverClaimPanel';

type TrackingOrder = OrderBundleRow;

type SearchMode = 'orderNumber' | 'email';

/** The root (Order 1) row of a bundle, used to label it in the email-results picker. */
function bundleRoot(bundle: readonly TrackingOrder[]): TrackingOrder {
    return bundle.find((row) => !row.is_claim && row.parent_order_id == null) ?? bundle[0];
}

const OrderTracking: React.FC = () => {
    const [searchMode, setSearchMode] = useState<SearchMode>('orderNumber');
    const [email, setEmail] = useState('');
    // Bundles returned by an email lookup, newest first. Shown as a picker when
    // the customer has more than one; picking one loads it into the card below.
    const [emailBundles, setEmailBundles] = useState<TrackingOrder[][]>([]);
    const [orderId, setOrderId] = useState('');
    // The full bundle: the root order first, then any linked claim/add-on orders.
    const [bundle, setBundle] = useState<TrackingOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    // Which order in the bundle drives the main status card. Defaults to the
    // order the customer actually searched for, and switches when they tap one
    // of the linked "Your orders in this group buy" cards.
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const { orders: savedOrders } = useOrderHistory();
    const { uploadImage, uploading: uploadingProof } = useImageUpload('payment-proofs');
    const [balanceProofError, setBalanceProofError] = useState<string | null>(null);

    const trackOrder = useCallback(async (rawId: string) => {
        const trimmedId = rawId.trim();
        if (!trimmedId) return;

        setOrderId(trimmedId);
        setLoading(true);
        setError(null);
        // Do NOT clear the bundle here: doing so unmounts the results section
        // (including LeftoverClaimPanel) mid-refresh and wipes its local success
        // state. We only replace the bundle once new rows arrive below.
        setHasSearched(true);

        try {
            // Secure RPC: returns the root order plus any claim add-ons that share
            // its lookup. Root first, then claim rows.
            const { data, error } = await supabase.rpc('get_order_bundle', {
                order_id_input: trimmedId,
            });

            if (error) {
                throw error;
            }

            const rows = Array.isArray(data) ? (data as TrackingOrder[]) : [];
            if (rows.length === 0) {
                setBundle([]);
                setError('Order not found. Please check your Order ID and try again.');
                return;
            }

            setBundle(rows);
            // Show the order the customer searched for. Claim add-ons render in
            // their own section, so only match the numbered orders; fall back to
            // the root when the lookup was by a shared key (e.g. balance re-fetch).
            const root = rows.find((row) => !row.is_claim) ?? rows[0];
            const tracked =
                rows.find((row) => !row.is_claim && row.order_number === trimmedId) ?? root;
            setSelectedOrderId(tracked.id);
            posthog.capture('tbs_order_tracked', {
                order_number: tracked.order_number,
                order_status: tracked.order_status,
            });
        } catch (err) {
            console.error('Error fetching order:', err);
            setError('An error occurred while fetching your order. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleTrack = (e: React.FormEvent) => {
        e.preventDefault();
        void trackOrder(orderId);
    };

    // Load a chosen bundle (root + repeats + add-ons) into the status card. Used
    // when the customer taps one of their bundles in the email-results picker.
    const selectBundle = useCallback((rows: TrackingOrder[]) => {
        if (rows.length === 0) return;
        setBundle(rows);
        const root = bundleRoot(rows);
        setSelectedOrderId(root.id);
        setError(null);
    }, []);

    // Look up every order placed under an email via the secure RPC, then group
    // the flat rows back into per-bundle groups. One bundle auto-loads; several
    // render a picker the customer chooses from.
    const trackByEmail = useCallback(async (rawEmail: string) => {
        const trimmedEmail = rawEmail.trim();
        if (!trimmedEmail) return;

        setLoading(true);
        setError(null);
        setHasSearched(true);

        try {
            const { data, error } = await supabase.rpc('get_orders_by_email', {
                email_input: trimmedEmail,
            });

            if (error) {
                throw error;
            }

            const rows = Array.isArray(data) ? (data as TrackingOrder[]) : [];
            const bundles = groupBundlesByRoot(rows);

            if (bundles.length === 0) {
                setBundle([]);
                setEmailBundles([]);
                setSelectedOrderId(null);
                setError('No orders found for that email. Please check the address and try again.');
                return;
            }

            posthog.capture('tbs_orders_email_lookup', { bundle_count: bundles.length });

            if (bundles.length === 1) {
                // Only one order group — behave exactly like an order-number lookup.
                setEmailBundles([]);
                selectBundle(bundles[0]);
                return;
            }

            // Several groups — let the customer pick which one to view.
            setEmailBundles(bundles);
            setBundle([]);
            setSelectedOrderId(null);
        } catch (err) {
            console.error('Error fetching orders by email:', err);
            setError('An error occurred while fetching your orders. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [selectBundle]);

    const handleTrackByEmail = (e: React.FormEvent) => {
        e.preventDefault();
        void trackByEmail(email);
    };

    // Upload a fresh receipt for the balance owed after items were added, then
    // re-fetch so the banner updates to "under review". The order number is the
    // auth token; submit_additional_payment only accepts it when a balance is due.
    const handleBalanceProofUpload = useCallback(
        async (orderNumber: string, event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setBalanceProofError(null);
            try {
                const url = await uploadImage(file);
                const { error } = await supabase.rpc('submit_additional_payment', {
                    order_id_input: orderNumber,
                    proof_url: url,
                });
                if (error) throw error;
                await trackOrder(orderNumber);
            } catch (err) {
                console.error('Error submitting balance payment:', err);
                setBalanceProofError(
                    err instanceof Error ? err.message : 'Could not submit your receipt. Please try again.',
                );
            }
        },
        [uploadImage, trackOrder],
    );

    // The customer's own orders (root + any same-email repeats in this batch),
    // numbered Order 1, Order 2, … The root drives the merged timeline; claim
    // rows are listed separately as add-ons below.
    const sequencedOrders = sequenceBundleOrders(bundle);
    const order =
        sequencedOrders.find((seq) => seq.order.id === selectedOrderId)?.order ??
        sequencedOrders[0]?.order ??
        (bundle.length > 0 ? bundle[0] : null);
    const hasRepeatOrders = sequencedOrders.length > 1;
    const claimRows = bundle.filter((row) => row.is_claim);
    const isFinalizing = order?.batch_status === 'finalizing';

    // Merge the per-order local leg (order_status) with the shared batch leg
    // (fulfillment_stage) into one timeline. See utils/orderTracking.
    const tracking = order ? computeTrackingStep(order.order_status, order.fulfillment_stage) : null;
    const currentStep = tracking?.step ?? 0;
    const lastStepIndex = TRACKING_STEPS.length - 1;

    const StatusIcon =
        tracking?.isCancelled ? AlertCircle :
        currentStep >= 8 ? CheckCircle :
        currentStep >= 6 ? Truck :
        currentStep >= 2 ? Package :
        currentStep === 1 ? CheckCircle :
        Clock;

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-gold-50/10 to-white py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                {/* Back Button */}
                <a
                    href="/"
                    className="inline-flex items-center gap-2 text-gray-600 hover:text-navy-900 mb-6 group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-medium">Back to Shop</span>
                </a>

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-navy-900 mb-4">Track Your Order</h1>
                    <p className="text-gray-600">Enter your Order Number or email to check the current status of your package.</p>
                </div>

                {/* Search Box */}
                <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-8 border-2 border-navy-700/30">
                    {/* Search mode toggle — look up by Order Number or by email. */}
                    <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={searchMode === 'orderNumber'}
                            onClick={() => { setSearchMode('orderNumber'); setError(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all ${
                                searchMode === 'orderNumber' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-navy-900'
                            }`}
                        >
                            <Search className="w-4 h-4" />
                            Order Number
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={searchMode === 'email'}
                            onClick={() => { setSearchMode('email'); setError(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all ${
                                searchMode === 'email' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-navy-900'
                            }`}
                        >
                            <Mail className="w-4 h-4" />
                            Email
                        </button>
                    </div>

                    {searchMode === 'orderNumber' ? (
                        <form onSubmit={handleTrack} className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="text"
                                    value={orderId}
                                    onChange={(e) => setOrderId(e.target.value)}
                                    placeholder="Enter Order Number (e.g., TBS-1234)"
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all text-lg text-gray-900"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || !orderId.trim()}
                                className="bg-teal-500 hover:bg-teal-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Searching...
                                    </>
                                ) : (
                                    <>
                                        Track Order
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleTrackByEmail} className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter the email you ordered with"
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all text-lg text-gray-900"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || !email.trim()}
                                className="bg-teal-500 hover:bg-teal-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Searching...
                                    </>
                                ) : (
                                    <>
                                        Find My Orders
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Your recent orders — saved on this device for one-tap tracking */}
                {savedOrders.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-md p-5 md:p-6 mb-8 border border-gray-100">
                        <h2 className="text-sm font-bold text-navy-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gold-600" />
                            Your Recent Orders
                        </h2>
                        <div className="space-y-2">
                            {savedOrders.map((saved) => (
                                <button
                                    key={saved.orderNumber}
                                    type="button"
                                    onClick={() => void trackOrder(saved.orderNumber)}
                                    disabled={loading}
                                    className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-navy-900 hover:bg-gray-50 transition-all disabled:opacity-50"
                                >
                                    <div className="min-w-0">
                                        <p className="font-mono font-bold text-navy-900">{saved.orderNumber}</p>
                                        {saved.itemSummary && (
                                            <p className="text-xs text-gray-500 truncate">{saved.itemSummary}</p>
                                        )}
                                    </div>
                                    <span className="flex items-center gap-1 text-sm font-semibold text-teal-600 shrink-0">
                                        Track
                                        <ArrowRight className="w-4 h-4" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Results */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-fade-in">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Email lookup found several orders — let the customer pick one. */}
                {emailBundles.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-md p-5 md:p-6 mb-8 border border-gray-100 animate-fade-in">
                        <h2 className="text-sm font-bold text-navy-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Package className="w-4 h-4 text-gold-600" />
                            We found {emailBundles.length} orders — pick one to track
                        </h2>
                        <div className="space-y-2">
                            {emailBundles.map((emailBundle) => {
                                const rootRow = bundleRoot(emailBundle);
                                const itemCount = emailBundle
                                    .flatMap((row) => row.order_items)
                                    .reduce((sum, item) => sum + item.quantity, 0);
                                const isActive = bundle.some((row) => row.id === rootRow.id);
                                return (
                                    <button
                                        key={rootRow.id}
                                        type="button"
                                        onClick={() => selectBundle(emailBundle)}
                                        aria-pressed={isActive}
                                        className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3 rounded-xl border transition-all ${
                                            isActive
                                                ? 'bg-gold-50/40 border-navy-900 ring-2 ring-gold-500/20'
                                                : 'border-gray-200 hover:border-navy-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <p className="font-mono font-bold text-navy-900">
                                                {rootRow.order_number || rootRow.id.slice(0, 8).toUpperCase()}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {itemCount} item{itemCount === 1 ? '' : 's'} · {orderStatusLabel(rootRow.order_status)}
                                            </p>
                                        </div>
                                        <span className="flex items-center gap-1 text-sm font-semibold text-teal-600 shrink-0">
                                            Track
                                            <ArrowRight className="w-4 h-4" />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hasSearched && order && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Additional payment required — items were added after payment */}
                        {order.balance_due > 0 && order.order_number && (
                            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-md">
                                <div className="flex items-center gap-2 text-amber-800 mb-2">
                                    <AlertCircle className="w-5 h-5" />
                                    <h2 className="text-lg font-bold">
                                        Additional payment required — ₱{order.balance_due.toLocaleString()}
                                    </h2>
                                </div>
                                {order.payment_status === 'submitted' ? (
                                    <p className="text-sm text-amber-800">
                                        Thanks! Your new receipt is under review. We'll confirm your order
                                        once payment is verified. You can upload a different receipt if needed.
                                    </p>
                                ) : (
                                    <p className="text-sm text-amber-800">
                                        New items were added to your order. Please pay the remaining
                                        ₱{order.balance_due.toLocaleString()} and upload your receipt below so we
                                        can confirm your order.
                                    </p>
                                )}
                                <label
                                    className={`mt-4 inline-flex items-center gap-2 px-5 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-bold cursor-pointer transition-colors ${
                                        uploadingProof ? 'opacity-50 pointer-events-none' : ''
                                    }`}
                                >
                                    <Upload className="w-5 h-5" />
                                    {uploadingProof ? 'Uploading…' : 'Upload new receipt'}
                                    <input
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={(e) => void handleBalanceProofUpload(order.order_number as string, e)}
                                        disabled={uploadingProof}
                                        className="hidden"
                                    />
                                </label>
                                {balanceProofError && (
                                    <p className="mt-2 text-sm text-red-600">{balanceProofError}</p>
                                )}
                            </div>
                        )}

                        {/* Status Card */}
                        <div className="bg-white rounded-2xl shadow-xl border-2 border-navy-700/30 overflow-hidden">
                            <div className="bg-navy-900 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
                                <div>
                                    <p className="text-white text-sm font-semibold uppercase tracking-wider mb-1">Order Status</p>
                                    <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                                        <StatusIcon className="w-6 h-6 text-gold-400" />
                                        {tracking?.isCancelled ? 'Cancelled' : (tracking?.current?.label ?? order.order_status)}
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-400 text-sm">Order Number</p>
                                    <p className="font-mono text-lg">{order.order_number || order.id.slice(0, 8).toUpperCase()}</p>
                                </div>
                            </div>

                            <div className="p-6 md:p-8">
                                {/* Progress Bar */}
                                {!tracking?.isCancelled ? (
                                    <div className="mb-8">
                                        {tracking?.current?.message && (
                                            <p className="text-sm text-gray-600 mb-6 text-center max-w-xl mx-auto">
                                                {tracking.current.message}
                                            </p>
                                        )}
                                        <div className="overflow-x-auto pb-2">
                                            <div className="relative min-w-[680px]">
                                                <div className="absolute top-4 left-0 w-full h-1 bg-gray-200 -translate-y-1/2 rounded-full" />
                                                <div
                                                    className="absolute top-4 left-0 h-1 bg-gold-500 -translate-y-1/2 rounded-full transition-all duration-500"
                                                    style={{ width: `${Math.min(100, Math.max(0, (currentStep / lastStepIndex) * 100))}%` }}
                                                />

                                                <div className="relative flex justify-between">
                                                    {TRACKING_STEPS.map((step, index) => {
                                                        const isCompleted = index <= currentStep;
                                                        const isCurrent = index === currentStep;

                                                        return (
                                                            <div key={step.key} className="flex flex-col items-center gap-2 flex-1">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-white ${isCompleted ? 'border-navy-900 text-gold-600' : 'border-gray-300 text-gray-300'
                                                                    } ${isCurrent ? 'ring-4 ring-gold-500/20 scale-110' : ''}`}>
                                                                    {index < currentStep ? (
                                                                        <CheckCircle className="w-5 h-5 fill-gold-50" />
                                                                    ) : (
                                                                        <div className={`w-3 h-3 rounded-full ${isCompleted ? 'bg-gold-500' : 'bg-gray-300'}`} />
                                                                    )}
                                                                </div>
                                                                <span className={`text-[10px] md:text-xs font-medium text-center max-w-[72px] leading-tight ${isCompleted ? 'text-navy-900' : 'text-gray-400'
                                                                    } ${isCurrent ? 'font-bold' : ''}`}>{step.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-red-800 mb-6 flex items-center gap-3">
                                        <AlertCircle className="w-6 h-6 text-red-600" />
                                        <div>
                                            <p className="font-bold">Order Cancelled</p>
                                            <p className="text-sm">This order has been cancelled. Please contact support if you think this is a mistake.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Tracking Details Block */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                                        <h3 className="font-bold text-navy-900 mb-4 flex items-center gap-2">
                                            <Truck className="w-5 h-5 text-gold-600" />
                                            Tracking Information
                                        </h3>

                                        {order.tracking_number ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                                                        Tracking {order.shipping_provider === 'lbc' ? 'Number' : 'ID'} ({
                                                            order.shipping_provider === 'lbc' ? 'LBC Express' :
                                                                order.shipping_provider === 'lalamove' ? 'Lalamove' :
                                                                    order.shipping_provider === 'maxim' ? 'Maxim' :
                                                                        order.shipping_provider === 'spx' ? 'SPX Express' : 'J&T Express'
                                                        })
                                                    </p>
                                                    <p className="text-xl font-mono font-bold text-navy-900 tracking-wide">{order.tracking_number}</p>
                                                </div>

                                                {order.shipping_provider === 'lbc' ? (
                                                    <a
                                                        href={`https://www.lbcexpress.com/track/?tracking_no=${order.tracking_number}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700"
                                                    >
                                                        Track on LBC Express
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                ) : order.shipping_provider === 'lalamove' ? (
                                                    <a
                                                        href="https://web.lalamove.com/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600"
                                                    >
                                                        Open Lalamove App/Web
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                ) : order.shipping_provider === 'maxim' ? (
                                                    <a
                                                        href="https://taximaxim.com/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black"
                                                    >
                                                        Open Maxim App/Web
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                ) : (
                                                    <a
                                                        href={order.shipping_provider === 'spx'
                                                            ? `https://spx.ph/track`
                                                            : `https://www.jtexpress.ph/trajectoryQuery?bills=${order.tracking_number}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${order.shipping_provider === 'spx' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'
                                                            }`}
                                                    >
                                                        Track on {order.shipping_provider === 'spx' ? 'SPX Express' : 'J&T Express'}
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-gray-500">
                                                <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                                <p>No tracking number available yet.</p>
                                                <p className="text-xs mt-1">Check back later when your order is shipped.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        {order.shipping_note && (
                                            <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                                                <h3 className="font-bold text-navy-900 mb-2 flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-blue-600" />
                                                    Shipping Update
                                                </h3>
                                                <p className="text-gray-700 text-sm leading-relaxed">{order.shipping_note}</p>
                                            </div>
                                        )}

                                        <div className="bg-white rounded-xl p-5 border-2 border-gray-100">
                                            <h3 className="font-bold text-navy-900 mb-3 text-sm uppercase tracking-wider border-b pb-2">Order Summary</h3>
                                            <div className="space-y-2 mb-4">
                                                {order.order_items.map((item) => (
                                                    <div key={`${item.product_id}-${item.variation_id ?? 'base'}`} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-100 font-bold text-lg text-navy-900">
                                                <span>Total</span>
                                                <span>₱{(order.total_price + (order.shipping_fee || 0)).toLocaleString()}</span>
                                            </div>
                                            {order.discount_applied && order.discount_applied > 0 && (
                                                <div className="flex justify-between items-center pt-2 text-sm text-green-600 font-medium">
                                                    <span>Discount ({order.promo_code || 'Promo'}):</span>
                                                    <span>-₱{order.discount_applied.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Your orders in this group buy — same-email repeats share this
                            tracking, each keeping its own payment method and status. */}
                        {hasRepeatOrders && (
                            <div className="bg-white rounded-2xl shadow-xl border-2 border-navy-700/30 overflow-hidden">
                                <div className="bg-navy-900 p-6 flex items-center gap-3 text-white">
                                    <Package className="w-6 h-6 text-gold-400" />
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Your orders in this group buy</h2>
                                        <p className="text-sm text-gray-300">All orders you placed under this tracking, with their own payment.</p>
                                    </div>
                                </div>
                                <div className="p-6 md:p-8 space-y-4">
                                    {sequencedOrders.map(({ order: seqOrder, label }) => (
                                        <button
                                            key={seqOrder.id}
                                            type="button"
                                            onClick={() => setSelectedOrderId(seqOrder.id)}
                                            aria-pressed={seqOrder.id === order.id}
                                            className={`w-full text-left rounded-xl p-5 border transition-all ${
                                                seqOrder.id === order.id
                                                    ? 'bg-gold-50/40 border-navy-900 ring-2 ring-gold-500/20'
                                                    : 'bg-gray-50 border-gray-200 hover:border-navy-900 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{label}</p>
                                                    <p className="font-mono font-bold text-navy-900">
                                                        {seqOrder.order_number || seqOrder.id.slice(0, 8).toUpperCase()}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-navy-900 text-gold-300">
                                                    {orderStatusLabel(seqOrder.order_status)}
                                                </span>
                                            </div>
                                            <div className="space-y-1 mb-3">
                                                {seqOrder.order_items.map((item) => (
                                                    <div key={`${item.product_name}`} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200 text-sm">
                                                <span className="text-gray-500">
                                                    Payment: <span className="font-semibold text-navy-900">{seqOrder.payment_method_name || 'Not specified'}</span>
                                                </span>
                                                <span className="font-bold text-navy-900">
                                                    ₱{(seqOrder.total_price + (seqOrder.shipping_fee || 0)).toLocaleString()}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Add-ons in this group buy — claim/add-on orders linked to the root. */}
                        {claimRows.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-xl border-2 border-navy-700/30 overflow-hidden">
                                <div className="bg-navy-900 p-6 flex items-center gap-3 text-white">
                                    <Gift className="w-6 h-6 text-gold-400" />
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Add-ons in this group buy</h2>
                                        <p className="text-sm text-gray-300">Extra units you claimed against this order.</p>
                                    </div>
                                </div>
                                <div className="p-6 md:p-8 space-y-4">
                                    {claimRows.map((claim) => (
                                        <div
                                            key={claim.id}
                                            className="bg-gray-50 rounded-xl p-5 border border-gray-200"
                                        >
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Add-on</p>
                                                    <p className="font-mono font-bold text-navy-900">
                                                        {claim.order_number || claim.id.slice(0, 8).toUpperCase()}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-navy-900 text-gold-300">
                                                    {orderStatusLabel(claim.order_status)}
                                                </span>
                                            </div>
                                            <div className="space-y-1 mb-3">
                                                {claim.order_items.map((item) => (
                                                    <div key={`${item.product_id}-${item.variation_id ?? 'base'}`} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-200 font-bold text-navy-900">
                                                <span>Total</span>
                                                <span>₱{(claim.total_price + (claim.shipping_fee || 0)).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Leftover claim panel — only while the batch is finalizing. */}
                        {isFinalizing && order.group_buy_batch_id && order.order_number && (
                            <LeftoverClaimPanel
                                batchId={order.group_buy_batch_id}
                                orderNumber={order.order_number}
                                onClaimed={() => order.order_number && void trackOrder(order.order_number)}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrderTracking;
