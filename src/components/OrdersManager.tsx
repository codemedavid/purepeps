import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Package, CheckCircle, XCircle, Clock, Truck, AlertCircle, Search, RefreshCw, Eye, MessageCircle, Image as ImageIcon, Layers, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMenu } from '../hooks/useMenu';
import { useCouriers } from '../hooks/useCouriers';
import posthog from '../lib/posthog';
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from '../utils/orderTracking';
import { planOrderConfirmation } from '../utils/orderConfirmation';
import {
  COD_STATUS_OPTIONS,
  PAY_NOW_STATUS_OPTIONS,
  codAmountDue,
  orderGrandTotal,
  paymentStatusColor,
  paymentStatusLabel,
  paymentTypeLabel,
  resolveRefundStatus,
} from '../constants/payment';
import { toFacebookProfileUrl } from '../utils/facebookLink';
import { buildWaybillData, canPrintWaybill, printableWaybillOrders } from '../utils/waybill';
import {
  groupOrdersIntoBatchSections,
  batchLabel,
  type BatchSummary,
} from '../utils/orderBatchSections';
import { WaybillModal } from './waybill/WaybillModal';

interface OrderItem {
  product_id: string;
  product_name: string;
  variation_id: string | null;
  variation_name: string | null;
  quantity: number;
  price: number;
  total: number;
  purity_percentage?: number;
}

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  shipping_barangay: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_zip_code: string;
  shipping_country: string;
  shipping_location: string | null;
  shipping_fee: number | null;
  order_items: OrderItem[];
  total_price: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_type: string | null;
  refunded_total: number | null;
  manually_confirmed_at: string | null;
  manually_confirmed_by: string | null;
  payment_proof_url: string | null;
  contact_method: string | null;
  order_status: string;
  payment_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_note: string | null;
  promo_code: string | null;
  discount_applied: number | null;
  order_number: string | null;
  group_buy_batch_id?: string | null;
}

// Sentinel filter values that sit alongside the per-batch ids.
const BATCH_FILTER_ALL = 'all';
const BATCH_FILTER_REGULAR = 'regular';

interface OrdersManagerProps {
  onBack: () => void;
}

const OrdersManager: React.FC<OrdersManagerProps> = ({ onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>(BATCH_FILTER_ALL);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // Orders queued for the print preview: one for a single card's Waybill button,
  // every printable order in the current view for "Print all waybills". Empty = closed.
  const [printQueue, setPrintQueue] = useState<Order[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { refreshProducts } = useMenu();

  useEffect(() => {
    loadOrders();
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('group_buy_batches')
        .select('id, batch_number, name, status')
        .order('batch_number', { ascending: false });

      if (error) throw error;
      setBatches((data as BatchSummary[]) || []);
    } catch (error) {
      console.error('Error loading group-buy batches:', error);
    }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      alert('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleConfirmOrder = async (order: Order) => {
    const isBatchOrder = !!order.group_buy_batch_id;
    const confirmMessage = isBatchOrder
      ? `Confirm order #${order.order_number || order.id.slice(0, 8)}? This is a group-buy pre-order. No stock will be deducted.`
      : `Confirm order #${order.order_number || order.id.slice(0, 8)}? This will deduct stock from inventory.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // Work out what confirming should actually write. A failed or refunded
    // payment needs a second, explicit yes — asked BEFORE any stock moves, so
    // declining leaves inventory untouched.
    const { data: authData } = await supabase.auth.getUser();
    const plan = planOrderConfirmation(order, {
      now: new Date().toISOString(),
      adminEmail: authData?.user?.email ?? null,
    });

    if (plan.requiresOverride && !confirm(`${plan.warning}\n\nConfirm anyway?`)) {
      return;
    }

    try {
      setIsProcessing(true);

      // Group-buy pre-orders are reserved against a batch cap, not inventory stock.
      // Skip the stock check + deduction for batch orders.
      if (!order.group_buy_batch_id) {
        // First, check if all items are still in stock
        for (const item of order.order_items) {
          if (item.variation_id) {
            // Check variation stock
            const { data: variation, error: varError } = await supabase
              .from('product_variations')
              .select('stock_quantity')
              .eq('id', item.variation_id)
              .single();

            if (varError) {
              if (varError.code === 'PGRST116') {
                throw new Error(`Variation "${item.variation_name}" not found. It may have been deleted.`);
              }
              throw varError;
            }

            if (!variation || variation.stock_quantity < item.quantity) {
              alert(`Insufficient stock for ${item.product_name} ${item.variation_name || ''}. Available: ${variation?.stock_quantity || 0}, Required: ${item.quantity}`);
              return;
            }
          } else {
            // Check product stock
            const { data: product, error: prodError } = await supabase
              .from('products')
              .select('stock_quantity')
              .eq('id', item.product_id)
              .single();

            if (prodError) {
              if (prodError.code === 'PGRST116') {
                throw new Error(`Product "${item.product_name}" not found. It may have been deleted.`);
              }
              throw prodError;
            }
            if (!product || product.stock_quantity < item.quantity) {
              alert(`Insufficient stock for ${item.product_name}. Available: ${product?.stock_quantity || 0}, Required: ${item.quantity}`);
              return;
            }
          }
        }

        // Deduct stock for each item
        for (const item of order.order_items) {
          if (item.variation_id) {
            // Deduct from variation - get current stock and update
            const { data: variation, error: varError } = await supabase
              .from('product_variations')
              .select('stock_quantity')
              .eq('id', item.variation_id)
              .single();

            if (varError) throw varError;

            if (variation) {
              const newStock = Math.max(0, variation.stock_quantity - item.quantity);
              const { error: updateError } = await supabase
                .from('product_variations')
                .update({ stock_quantity: newStock })
                .eq('id', item.variation_id);

              if (updateError) throw updateError;
            }
          } else {
            // Deduct from product - get current stock and update
            const { data: product, error: prodError } = await supabase
              .from('products')
              .select('stock_quantity')
              .eq('id', item.product_id)
              .single();

            if (prodError) throw prodError;

            if (product) {
              const newStock = Math.max(0, product.stock_quantity - item.quantity);
              const { error: updateError } = await supabase
                .from('products')
                .update({ stock_quantity: newStock })
                .eq('id', item.product_id);

              if (updateError) throw updateError;
            }
          }
        }
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          ...plan.updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // Refresh orders and products
      await loadOrders();
      await refreshProducts();

      // Trigger custom event to refresh inventory sales data
      window.dispatchEvent(new CustomEvent('orderConfirmed'));

      // Build items description for email template
      const items_description = order.order_items.map(item =>
        `${item.quantity}x ${item.product_name}${item.variation_name ? ` - ${item.variation_name}` : ''} (₱${item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })})`
      ).join('\n');

      posthog.capture('tbs_order_confirmed', {
        order_id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        email: order.customer_email,
        customer_phone: order.customer_phone,
        total_price: order.total_price,
        shipping_fee: order.shipping_fee,
        item_count: order.order_items.length,
        items_description,
        payment_type: order.payment_type,
        payment_method: order.payment_method_name,
        cod_amount_due: order.payment_type === 'cod' ? codAmountDue(order) : null,
        promo_code: order.promo_code,
        discount_applied: order.discount_applied,
        $set: { email: order.customer_email, name: order.customer_name },
      });

      alert(
        isBatchOrder
          ? 'Batch order confirmed. No inventory changes were made.'
          : 'Order confirmed! Stock has been deducted from inventory.',
      );
      setSelectedOrder(null);
    } catch (error: any) {
      console.error('Error confirming order:', error);
      const errorMessage = error instanceof Error ? error.message : error?.message || 'Unknown error';
      alert(`Failed to confirm order: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Set an order's payment status by hand.
   *
   * Choosing a refund state asks for the amount, so refunded_total and the
   * status token cannot drift apart (the DB stores the amount; 'refunded' vs
   * 'partially_refunded' is derived from it — see resolveRefundStatus).
   */
  const handleUpdatePaymentStatus = async (order: Order, newStatus: string) => {
    if (newStatus === order.payment_status) return;

    const updates: Record<string, unknown> = {
      payment_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'refunded' || newStatus === 'partially_refunded') {
      // The ORDER's worth, not the courier's cash. codAmountDue is the shipping
      // fee alone now, and offering that as a full refund would settle a ₱7,750
      // order by handing back ₱150.
      const due = orderGrandTotal(order);
      const suggested = newStatus === 'refunded' ? String(due) : '';
      const entered = prompt(
        `How much was refunded? (order total ₱${due.toLocaleString('en-PH')})`,
        suggested,
      );
      if (entered === null) return;

      const amount = Number(entered);
      if (!Number.isFinite(amount) || amount <= 0) {
        alert('Please enter a refund amount greater than zero.');
        return;
      }
      if (amount > due) {
        alert(`A refund cannot exceed the order total of ₱${due.toLocaleString('en-PH')}.`);
        return;
      }

      // Keep the stored token honest about the amount actually returned.
      updates.refunded_total = amount;
      updates.payment_status = resolveRefundStatus(due, amount) ?? newStatus;
    } else {
      // Leaving a refund state (e.g. a refund bounced and the order is paid
      // after all) must clear the amount too, or the details panel keeps
      // reporting a refund that no longer exists.
      updates.refunded_total = null;
    }

    // A manual confirmation overrode a specific bad payment. Once the money is
    // refunded or has failed outright, that override should not keep the order
    // counting as confirmed demand — otherwise the cap slot can only be freed by
    // cancelling, which erases the record of what happened.
    if (
      updates.payment_status === 'refunded' ||
      updates.payment_status === 'partially_refunded' ||
      updates.payment_status === 'failed'
    ) {
      updates.manually_confirmed_at = null;
      updates.manually_confirmed_by = null;
    }

    try {
      setIsProcessing(true);
      const { error } = await supabase.from('orders').update(updates).eq('id', order.id);
      if (error) throw error;

      await loadOrders();
      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...selectedOrder, ...(updates as Partial<Order>) });
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Failed to update payment status. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      setIsProcessing(true);

      const order = orders.find((o) => o.id === orderId);
      const now = new Date().toISOString();

      // Advancing an order past 'new' IS confirming it, whichever control the
      // admin used. Without this, picking "Packing" straight from the dropdown
      // moved order_status alone and left the order permanently outside
      // confirmed_quantity — invisible to cap maths and supplier kit counts
      // while it was being packed and shipped.
      const needsPaymentDecision =
        order?.order_status === 'new' && newStatus !== 'new' && newStatus !== 'cancelled';

      let paymentUpdates: Record<string, unknown> = {};
      if (needsPaymentDecision && order) {
        const { data: authData } = await supabase.auth.getUser();
        const plan = planOrderConfirmation(order, {
          now,
          adminEmail: authData?.user?.email ?? null,
        });
        if (plan.requiresOverride && !confirm(`${plan.warning}\n\nContinue?`)) {
          return;
        }
        const { order_status: _ignored, ...rest } = plan.updates;
        paymentUpdates = rest;
      }

      const { error } = await supabase
        .from('orders')
        .update({
          order_status: newStatus,
          ...paymentUpdates,
          updated_at: now
        })
        .eq('id', orderId);

      if (error) throw error;

      const eventMap: Record<string, string> = {
        packing: 'tbs_order_packing',
        out_for_delivery: 'tbs_order_out_for_delivery',
        delivered: 'tbs_order_delivered',
        cancelled: 'tbs_order_cancelled',
        processing: 'tbs_order_processing', // legacy
        shipped: 'tbs_order_shipped', // legacy
      };
      if (eventMap[newStatus] && order) {
        const items_description = order.order_items.map(item =>
          `${item.quantity}x ${item.product_name}${item.variation_name ? ` - ${item.variation_name}` : ''}`
        ).join('\n');

        posthog.capture(eventMap[newStatus], {
          order_id: orderId,
          order_number: order.order_number,
          customer_name: order.customer_name,
          email: order.customer_email,
          customer_phone: order.customer_phone,
          total_price: order.total_price,
          shipping_fee: order.shipping_fee,
          items_description,
          item_count: order.order_items.length,
          tracking_number: order.tracking_number,
          shipping_provider: order.shipping_provider,
          previous_status: order.order_status,
          promo_code: order.promo_code,
          discount_applied: order.discount_applied,
          $set: { email: order.customer_email, name: order.customer_name },
        });
      }

      await loadOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, order_status: newStatus });
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Failed to update order status. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveTracking = async (orderId: string, trackingNumber: string, shippingProvider: string, shippingNote: string) => {
    try {
      setIsProcessing(true);
      const { error } = await supabase
        .from('orders')
        .update({
          tracking_number: trackingNumber || null,
          shipping_provider: shippingProvider || 'jnt',
          shipping_note: shippingNote || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      const updatedOrders = orders.map(o =>
        o.id === orderId
          ? { ...o, tracking_number: trackingNumber || null, shipping_provider: shippingProvider || 'jnt', shipping_note: shippingNote || null }
          : o
      );
      setOrders(updatedOrders);

      if (selectedOrder?.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          tracking_number: trackingNumber || null,
          shipping_provider: shippingProvider || 'jnt',
          shipping_note: shippingNote || null
        });
      }

      alert('Tracking information saved successfully!');
    } catch (error) {
      console.error('Error saving tracking info:', error);
      alert('Failed to save tracking information.');
    } finally {
      setIsProcessing(false);
    }
  };

  const batchById = useMemo(() => {
    return new Map(batches.map((batch) => [batch.id, batch]));
  }, [batches]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.order_status === statusFilter);
    }

    // Filter by group-buy batch
    if (batchFilter === BATCH_FILTER_REGULAR) {
      filtered = filtered.filter(o => !o.group_buy_batch_id);
    } else if (batchFilter !== BATCH_FILTER_ALL) {
      filtered = filtered.filter(o => o.group_buy_batch_id === batchFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.customer_name.toLowerCase().includes(query) ||
        o.customer_email.toLowerCase().includes(query) ||
        o.customer_phone.includes(query) ||
        o.id.toLowerCase().includes(query) ||
        (o.order_number && o.order_number.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [orders, statusFilter, batchFilter, searchQuery]);

  // "Print all waybills" prints exactly what the admin is looking at, minus the
  // orders that have no shipment yet ('new') or never will ('cancelled'). Narrow
  // the status/batch filters or the search box to narrow the print run.
  const printableOrders = useMemo(() => printableWaybillOrders(filteredOrders), [filteredOrders]);

  // Each batch in view becomes its own section with its own print run. Built
  // from filteredOrders, so status/batch/search narrowing still decides what is
  // on screen — grouping only partitions what those filters left.
  const orderSections = useMemo(
    () => groupOrdersIntoBatchSections(filteredOrders, batches),
    [filteredOrders, batches],
  );

  const statusCounts = useMemo(() => {
    return {
      all: orders.length,
      new: orders.filter(o => o.order_status === 'new').length,
      confirmed: orders.filter(o => o.order_status === 'confirmed').length,
      packing: orders.filter(o => o.order_status === 'packing').length,
      out_for_delivery: orders.filter(o => o.order_status === 'out_for_delivery').length,
      delivered: orders.filter(o => o.order_status === 'delivered').length,
      cancelled: orders.filter(o => o.order_status === 'cancelled').length,
    };
  }, [orders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-yellow-100 text-black border-yellow-400';
      case 'confirmed': return 'bg-blue-100 text-black border-blue-300';
      case 'packing': return 'bg-purple-100 text-black border-purple-300';
      case 'out_for_delivery': return 'bg-indigo-100 text-black border-indigo-300';
      case 'delivered': return 'bg-green-100 text-black border-green-300';
      case 'cancelled': return 'bg-red-100 text-black border-red-300';
      // legacy statuses
      case 'processing': return 'bg-purple-100 text-black border-purple-300';
      case 'shipped': return 'bg-indigo-100 text-black border-indigo-300';
      default: return 'bg-gray-100 text-black border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <Clock className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'packing': return <Package className="w-4 h-4" />;
      case 'out_for_delivery': return <Truck className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      // legacy statuses
      case 'processing': return <Package className="w-4 h-4" />;
      case 'shipped': return <Truck className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  // Build one waybill for an order. Regular orders carry no per-batch admin fee,
  // so adminFee is left off (shown as absent, not ₱0).
  const buildOrderWaybill = (order: Order) => {
    const batch = order.group_buy_batch_id ? batchById.get(order.group_buy_batch_id) : undefined;
    return buildWaybillData(order, {
      batchLabel: order.group_buy_batch_id ? (batch ? batchLabel(batch) : 'Group Buy') : null,
    });
  };

  const waybillModal = printQueue.length > 0 ? (
    <WaybillModal
      waybills={printQueue.map(buildOrderWaybill)}
      onClose={() => setPrintQueue([])}
    />
  ) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-gold-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading orders... ✨</p>
        </div>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <>
        {waybillModal}
        <OrderDetailsView
          order={selectedOrder}
          batch={selectedOrder.group_buy_batch_id ? batchById.get(selectedOrder.group_buy_batch_id) : undefined}
          onBack={() => setSelectedOrder(null)}
          onConfirm={() => handleConfirmOrder(selectedOrder)}
          onUpdateStatus={handleUpdateOrderStatus}
          onUpdatePaymentStatus={handleUpdatePaymentStatus}
          onSaveTracking={handleSaveTracking}
          onPrintWaybill={() => setPrintQueue([selectedOrder])}
          isProcessing={isProcessing}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      {waybillModal}
      {/* Header */}
      <div className="bg-white shadow-md border-b-4 border-navy-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-12 md:h-14 gap-2">
            <div className="flex items-center space-x-2 md:space-x-4 min-w-0 flex-1">
              <button
                onClick={onBack}
                className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 md:gap-2 group"
              >
                <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs md:text-sm">Dashboard</span>
              </button>
              <h1 className="text-sm md:text-base lg:text-xl font-bold text-navy-900 truncate">
                Orders Management
              </h1>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-sakura-dark hover:bg-sakura-deep text-white px-2 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-medium text-xs md:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-1 md:gap-2 disabled:opacity-50 border border-sakura-dark/20"
            >
              <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 md:py-4 lg:py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3 mb-4 md:mb-6">
          <button
            onClick={() => setStatusFilter('all')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'all' ? 'border-navy-900 shadow-gold-glow' : 'border-gray-200 hover:border-navy-700'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">All Orders</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{statusCounts.all}</p>
          </button>
          <button
            onClick={() => setStatusFilter('new')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'new' ? 'border-navy-900 shadow-gold-glow' : 'border-gray-200 hover:border-navy-700'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">New</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gold-600">{statusCounts.new}</p>
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'confirmed' ? 'border-navy-900 shadow-gold-glow' : 'border-gray-200 hover:border-navy-700'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Confirmed</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{statusCounts.confirmed}</p>
          </button>
          <button
            onClick={() => setStatusFilter('packing')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'packing' ? 'border-navy-900 shadow-gold-glow' : 'border-gray-200 hover:border-navy-700'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Packing</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800">{statusCounts.packing}</p>
          </button>
          <button
            onClick={() => setStatusFilter('out_for_delivery')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'out_for_delivery' ? 'border-navy-900 shadow-gold-glow' : 'border-gray-200 hover:border-navy-700'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Out for Delivery</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{statusCounts.out_for_delivery}</p>
          </button>
          <button
            onClick={() => setStatusFilter('delivered')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'delivered' ? 'border-navy-900 shadow-gold-glow' : 'border-gray-200 hover:border-navy-700'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Delivered</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-green-600">{statusCounts.delivered}</p>
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-2 md:p-3 lg:p-4 border-2 transition-all ${statusFilter === 'cancelled' ? 'border-red-500' : 'border-gray-200 hover:border-red-300'
              }`}
          >
            <p className="text-[10px] md:text-xs text-gray-600 mb-1">Cancelled</p>
            <p className="text-lg md:text-xl lg:text-2xl font-bold text-red-600">{statusCounts.cancelled}</p>
          </button>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-3 md:p-4 lg:p-6 mb-4 md:mb-6 border border-navy-700/30">
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
              <input
                type="text"
                placeholder="Search by customer name, email, phone, or order ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2 text-sm md:text-base border-2 border-gray-200 rounded-lg focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/20 transition-colors text-black"
              />
            </div>
            <div className="relative md:w-72">
              <Layers className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5 pointer-events-none" />
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-2 text-sm md:text-base border-2 border-gray-200 rounded-lg focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/20 transition-colors text-black bg-white cursor-pointer appearance-none"
              >
                <option value={BATCH_FILTER_ALL}>All orders</option>
                <option value={BATCH_FILTER_REGULAR}>Regular orders only</option>
                {batches.length > 0 && (
                  <optgroup label="Group Buy batches">
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batchLabel(batch)}
                        {batch.status === 'open' ? ' (open)' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <button
              onClick={() => setPrintQueue(printableOrders)}
              disabled={printableOrders.length === 0}
              title={
                printableOrders.length === 0
                  ? 'No confirmed orders in this view to print.'
                  : 'Print a waybill for every printable order currently shown'
              }
              className="bg-sakura-dark hover:bg-sakura-deep text-white px-3 md:px-4 py-2 rounded-lg font-medium text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border border-sakura-dark/20 shrink-0"
            >
              <Printer className="w-4 h-4" />
              Print all waybills ({printableOrders.length})
            </button>
          </div>
          <p className="text-[11px] md:text-xs text-gray-500 mt-2">
            Prints every confirmed-or-later order currently shown — one waybill per page. Use the
            status cards, batch filter, or search to narrow the run.
          </p>
        </div>

        {/* Orders List */}
        <div className="space-y-3 md:space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-8 md:p-12 text-center border border-navy-700/30">
              <Package className="w-12 h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium text-base md:text-lg">No orders found</p>
              <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
            </div>
          ) : (
            orderSections.map((section) => (
              <section
                key={section.id}
                aria-labelledby={`section-${section.id}`}
                className="rounded-lg md:rounded-xl border border-sakura-edge bg-sakura-blush-soft/60 p-2 md:p-3"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 md:gap-3 px-1 md:px-2 py-1.5 md:py-2">
                  <div className="min-w-0">
                    <h3
                      id={`section-${section.id}`}
                      className="font-heading text-base md:text-lg text-sakura-ink truncate"
                    >
                      {section.headline}
                    </h3>
                    <p className="font-mono text-[10px] md:text-[11px] uppercase tracking-wider text-sakura-soft mt-0.5">
                      {section.orders.length} {section.orders.length === 1 ? 'order' : 'orders'}
                    </p>
                  </div>
                  <button
                    onClick={() => setPrintQueue(section.printableOrders)}
                    disabled={section.printableOrders.length === 0}
                    title={
                      section.printableOrders.length === 0
                        ? `No confirmed orders in ${section.headline} to print.`
                        : `Print a waybill for every printable order in ${section.headline}`
                    }
                    className="bg-sakura-dark hover:bg-sakura-deep text-white px-2.5 md:px-3 py-1.5 rounded-lg font-medium text-xs md:text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print all waybills ({section.printableOrders.length})
                  </button>
                </header>
                <div className="space-y-3 md:space-y-4">
                  {section.orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      batch={order.group_buy_batch_id ? batchById.get(order.group_buy_batch_id) : undefined}
                      onView={() => setSelectedOrder(order)}
                      onPrintWaybill={() => setPrintQueue([order])}
                      getStatusColor={getStatusColor}
                      getStatusIcon={getStatusIcon}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Order Card Component
interface OrderCardProps {
  order: Order;
  batch?: BatchSummary;
  onView: () => void;
  onPrintWaybill: () => void;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, batch, onView, onPrintWaybill, getStatusColor, getStatusIcon }) => {
  const totalItems = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const finalTotal = order.total_price + (order.shipping_fee || 0);

  return (
    <div
      onClick={onView}
      className="bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg p-3 md:p-4 lg:p-6 border border-navy-700/30 hover:border-navy-900 transition-all text-gray-900 cursor-pointer hover:bg-gray-50/50"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm md:text-base lg:text-lg truncate">
              Order #{order.order_number || order.id.slice(0, 8).toUpperCase()}
            </h3>
            <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold border flex items-center gap-1 ${getStatusColor(order.order_status)}`}>
              {getStatusIcon(order.order_status)}
              <span className="hidden sm:inline">{orderStatusLabel(order.order_status)}</span>
              <span className="sm:hidden">{order.order_status.charAt(0).toUpperCase()}</span>
            </span>
            <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold border ${paymentStatusColor(order.payment_status)}`}>
              {paymentStatusLabel(order.payment_status, order.payment_type)}
            </span>
            <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold border ${order.payment_type === 'cod'
              ? 'bg-amber-50 text-amber-800 border-amber-300'
              : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
              {order.payment_type === 'cod'
                ? `SF on delivery ₱${codAmountDue(order).toLocaleString('en-PH')}`
                : paymentTypeLabel(order.payment_type)}
            </span>
            {order.manually_confirmed_at && (
              <span
                className="px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold border bg-red-50 text-red-700 border-red-300"
                title={`Manually confirmed despite the payment state by ${order.manually_confirmed_by || 'an admin'}`}
              >
                Manually confirmed
              </span>
            )}
            {order.group_buy_batch_id && (
              <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold bg-brand-100 text-brand-700 border border-brand-300 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {batch ? batchLabel(batch) : 'Group Buy'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 text-xs md:text-sm">
            <div className="min-w-0">
              <span className="text-gray-500 text-[10px] md:text-xs">Customer</span>
              <p className="font-semibold text-gray-900 truncate">{order.customer_name}</p>
              <p className="text-[10px] md:text-xs text-gray-500 truncate">{order.customer_email}</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Items</span>
              <p className="font-semibold text-gray-900">{totalItems} item(s)</p>
              <p className="text-[10px] md:text-xs text-gray-500">{order.order_items.length} product(s)</p>
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Total</span>
              <p className="font-semibold text-gold-600">₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              {order.shipping_fee && order.shipping_fee > 0 && (
                <p className="text-[10px] md:text-xs text-gray-500">+ ₱{order.shipping_fee} shipping</p>
              )}
            </div>
            <div>
              <span className="text-gray-500 text-[10px] md:text-xs">Date</span>
              <p className="font-semibold text-gray-900">{new Date(order.created_at).toLocaleDateString()}</p>
              <p className="text-[10px] md:text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-w-[120px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="px-3 md:px-4 py-1.5 md:py-2 bg-charcoal-900 hover:bg-charcoal-800 text-white rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center justify-center gap-1 md:gap-2 shadow-md hover:shadow-lg"
          >
            <Eye className="w-3 h-3 md:w-4 md:h-4" />
            View Details
          </button>
          {canPrintWaybill(order.order_status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrintWaybill();
              }}
              className="px-3 md:px-4 py-1.5 md:py-2 bg-white border border-navy-900/30 text-navy-900 hover:bg-gray-50 rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center justify-center gap-1 md:gap-2 shadow-sm"
              title="Print customer waybill"
            >
              <Printer className="w-3 h-3 md:w-4 md:h-4" />
              Waybill
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Order Details View Component
interface OrderDetailsViewProps {
  order: Order;
  batch?: BatchSummary;
  onBack: () => void;
  onConfirm: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  onUpdatePaymentStatus: (order: Order, status: string) => void;
  onSaveTracking: (orderId: string, trackingNumber: string, shippingProvider: string, shippingNote: string) => void;
  onPrintWaybill: () => void;
  isProcessing: boolean;
}

const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({
  order,
  batch,
  onBack,
  onConfirm,
  onUpdateStatus,
  onUpdatePaymentStatus,
  onSaveTracking,
  onPrintWaybill,
  isProcessing
}) => {
  const { couriers } = useCouriers();
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || '');
  const [shippingProvider, setShippingProvider] = useState(order.shipping_provider || 'lbc');
  const [shippingNote, setShippingNote] = useState(order.shipping_note || '');

  // Update local state when order changes
  useEffect(() => {
    setTrackingNumber(order.tracking_number || '');
    setShippingProvider(order.shipping_provider || 'lbc');
    setShippingNote(order.shipping_note || '');
  }, [order]);

  const selectedCourier = couriers.find(c => c.code === shippingProvider);
  const trackingUrl = selectedCourier?.tracking_url_template && trackingNumber
    ? selectedCourier.tracking_url_template.replace('{tracking}', trackingNumber)
    : null;

  const totalItems = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const finalTotal = order.total_price + (order.shipping_fee || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
      <div className="bg-white shadow-md border-b border-navy-700/30 text-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-12 md:h-14 gap-2">
            <div className="flex items-center space-x-2 md:space-x-4 min-w-0 flex-1">
              <button
                onClick={onBack}
                className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 md:gap-2 group"
              >
                <ArrowLeft className="h-4 w-4 md:h-5 md:w-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs md:text-sm">Back to Orders</span>
              </button>
              <h1 className="text-sm md:text-base lg:text-xl font-bold text-navy-900 truncate">
                Order #{order.order_number || order.id.slice(0, 8).toUpperCase()}
              </h1>
            </div>
            {canPrintWaybill(order.order_status) && (
              <button
                onClick={onPrintWaybill}
                className="shrink-0 bg-white border border-navy-900/30 text-navy-900 hover:bg-gray-50 px-2 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-medium text-xs md:text-sm shadow-sm transition-all flex items-center gap-1 md:gap-2"
                title="Print customer waybill"
              >
                <Printer className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Print Waybill</span>
                <span className="sm:hidden">Waybill</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 md:py-6 lg:py-8">
        <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-4 md:p-6 border border-navy-700/30 space-y-4 md:space-y-6">
          {/* Group-buy batch banner */}
          {order.group_buy_batch_id && (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg p-3 text-brand-900">
              <Layers className="w-4 h-4 md:w-5 md:h-5 text-brand-700" />
              <span className="text-xs md:text-sm font-semibold">
                Group Buy pre-order — {batch ? batchLabel(batch) : 'Group Buy batch'}
              </span>
            </div>
          )}

          {/* Order Status */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
            <div>
              <span className={`inline-flex items-center px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-semibold border ${order.order_status === 'new' ? 'bg-yellow-100 text-black border-yellow-400' :
                order.order_status === 'confirmed' ? 'bg-blue-100 text-black border-blue-300' :
                  order.order_status === 'packing' || order.order_status === 'processing' ? 'bg-purple-100 text-black border-purple-300' :
                    order.order_status === 'out_for_delivery' || order.order_status === 'shipped' ? 'bg-indigo-100 text-black border-indigo-300' :
                      order.order_status === 'delivered' ? 'bg-green-100 text-black border-green-300' :
                        'bg-red-100 text-black border-red-300'
                }`}>
                {orderStatusLabel(order.order_status)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {order.order_status === 'new' && (
                <button
                  onClick={onConfirm}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-4 md:px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-colors font-medium text-xs md:text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-md hover:shadow-lg"
                >
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline">{isProcessing ? 'Processing...' : 'Confirm Order & Deduct Stock'}</span>
                  <span className="sm:hidden">{isProcessing ? 'Processing...' : 'Confirm Order'}</span>
                </button>
              )}
              {order.order_status !== 'cancelled' && (
                <select
                  value={order.order_status}
                  onChange={(e) => {
                    if (e.target.value === 'confirmed' && order.order_status === 'new') {
                      onConfirm();
                    } else {
                      onUpdateStatus(order.id, e.target.value);
                    }
                  }}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-3 md:px-4 py-2 border border-gray-300 rounded-lg text-xs md:text-sm font-medium bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent disabled:opacity-50 cursor-pointer"
                >
                  {/* Surface a legacy status (e.g. processing/shipped) so the select still
                      shows the current value for older orders. */}
                  {!ORDER_STATUS_OPTIONS.some((o) => o.value === order.order_status) && (
                    <option value={order.order_status}>{orderStatusLabel(order.order_status)}</option>
                  )}
                  {ORDER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Customer Info */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Customer Information</h3>
            <div className="bg-gray-50 rounded-lg p-3 md:p-4 space-y-1.5 md:space-y-2 text-xs md:text-sm text-gray-900">
              <p><span className="font-semibold">Name:</span> {order.customer_name}</p>
              <p><span className="font-semibold">Email:</span> {order.customer_email}</p>
              <p><span className="font-semibold">Phone:</span> {order.customer_phone}</p>
              {order.contact_method && (
                <p className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">Contact Method:</span>
                  {(() => {
                    const facebookUrl = toFacebookProfileUrl(order.contact_method);
                    if (facebookUrl) {
                      return (
                        <a
                          href={facebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <MessageCircle className="w-3 h-3 md:w-4 md:h-4" /> {order.contact_method}
                        </a>
                      );
                    }
                    return <span>{order.contact_method}</span>;
                  })()}
                </p>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Shipping Address</h3>
            <div className="bg-gray-50 rounded-lg p-3 md:p-4 text-xs md:text-sm text-gray-900">
              <p>{order.shipping_address}</p>
              {order.shipping_barangay && (
                <p>Barangay: {order.shipping_barangay}</p>
              )}
              <p>{order.shipping_city}, {order.shipping_state} {order.shipping_zip_code}</p>
              <p>{order.shipping_country}</p>
              {order.shipping_location && (
                <p className="mt-2"><span className="font-semibold">Region:</span> {order.shipping_location}</p>
              )}
            </div>
          </div>

          {/* Shipping & Tracking Details (Editable) */}
          <div className="bg-blue-50 rounded-lg md:rounded-xl p-4 md:p-6 border border-blue-100">
            <h3 className="font-bold text-navy-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              Shipping & Tracking Details
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tracking Number
                </label>
                <div className="flex flex-col md:flex-row gap-2">
                  <select
                    value={shippingProvider}
                    onChange={(e) => setShippingProvider(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-black bg-white"
                  >
                    {couriers.filter(c => c.is_active).map(courier => (
                      <option key={courier.id} value={courier.code}>{courier.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder={selectedCourier?.tracking_url_template ? "Enter tracking number" : "See App for details"}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-black"
                  />
                  {trackingUrl && (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center justify-center"
                      title="Track Shipment"
                    >
                      <Truck className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shipping Note (Optional)
                </label>
                <input
                  type="text"
                  value={shippingNote}
                  onChange={(e) => setShippingNote(e.target.value)}
                  placeholder="e.g., Shipped via J&T Express..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-black"
                />
              </div>
              <button
                onClick={() => onSaveTracking(order.id, trackingNumber, shippingProvider, shippingNote)}
                disabled={isProcessing}
                className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
              >
                {isProcessing ? 'Saving...' : 'Save Tracking Info'}
              </button>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Order Items ({totalItems} items)</h3>
            <div className="space-y-2">
              {order.order_items.map((item, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3 md:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-xs md:text-sm">
                      {item.product_name} {item.variation_name ? `- ${item.variation_name}` : ''}
                    </p>
                    <p className="text-[10px] md:text-xs text-gray-500">
                      Quantity: {item.quantity} × ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <p className="font-bold text-gray-900 text-xs md:text-sm sm:text-base">
                    ₱{item.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Proof */}
          {order.payment_proof_url && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4 md:w-5 md:h-5" />
                Payment Proof
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 md:p-4">
                <img
                  src={order.payment_proof_url}
                  alt="Payment proof"
                  className="max-w-full h-auto rounded-lg border border-gray-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = `
                      <div class="text-red-600 p-3 md:p-4 text-center text-xs md:text-sm">
                        <p>⚠️ Payment proof image failed to load</p>
                        <p class="text-[10px] md:text-xs text-gray-500 mt-2">URL: ${order.payment_proof_url}</p>
                      </div>
                    `;
                  }}
                />
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div>
            <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Payment Information</h3>
            <div className="bg-gray-50 rounded-lg p-3 md:p-4 space-y-1.5 md:space-y-2 text-xs md:text-sm text-gray-900">
              <p><span className="font-semibold">Option:</span> {paymentTypeLabel(order.payment_type)}</p>
              {/* Items are bought online under both options, so the method is
                  always meaningful. COD adds the fee the courier still collects. */}
              <p><span className="font-semibold">Method:</span> {order.payment_method_name || 'N/A'}</p>
              {order.payment_type === 'cod' && (
                <p>
                  <span className="font-semibold">Shipping fee to collect on delivery:</span>{' '}
                  ₱{codAmountDue(order).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="flex items-center gap-2 flex-wrap"><span className="font-semibold">Status:</span>
                <span className={`px-2 py-1 rounded-full text-[10px] md:text-xs font-semibold border ${paymentStatusColor(order.payment_status)}`}>
                  {paymentStatusLabel(order.payment_status, order.payment_type)}
                </span>
              </p>
              {order.refunded_total != null && Number(order.refunded_total) > 0 && (
                <p>
                  <span className="font-semibold">Refunded:</span>{' '}
                  ₱{Number(order.refunded_total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
              )}
              {order.manually_confirmed_at && (
                <p className="text-red-700">
                  <span className="font-semibold">Manually confirmed</span> by{' '}
                  {order.manually_confirmed_by || 'an admin'} on{' '}
                  {new Date(order.manually_confirmed_at).toLocaleString('en-PH', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })} — the payment was not verified.
                </p>
              )}
              <label className="flex items-center gap-2 flex-wrap pt-1">
                <span className="font-semibold">Set payment status:</span>
                <select
                  value={order.payment_status}
                  onChange={(e) => onUpdatePaymentStatus(order, e.target.value)}
                  disabled={isProcessing}
                  className="px-2 py-1 border border-gray-300 rounded text-xs md:text-sm bg-white"
                >
                  {!(order.payment_type === 'cod' ? COD_STATUS_OPTIONS : PAY_NOW_STATUS_OPTIONS)
                    .some((o) => o.value === order.payment_status) && (
                      <option value={order.payment_status}>
                        {paymentStatusLabel(order.payment_status, order.payment_type)}
                      </option>
                    )}
                  {(order.payment_type === 'cod' ? COD_STATUS_OPTIONS : PAY_NOW_STATUS_OPTIONS).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Order Summary */}
          <div className="border-t-2 border-gray-200 pt-3 md:pt-4 text-gray-900">
            <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">₱{(order.total_price + (order.discount_applied || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
              {order.discount_applied && order.discount_applied > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({order.promo_code || 'PROMO'}):</span>
                  <span className="font-semibold">-₱{order.discount_applied.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {order.shipping_fee && order.shipping_fee > 0 && (
                <div className="flex justify-between">
                  <span>Shipping Fee:</span>
                  <span className="font-semibold">₱{order.shipping_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-base md:text-lg font-bold border-t-2 border-gray-200 pt-2">
                <span>Total:</span>
                <span className="text-gold-600">₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Notes</h3>
              <div className="bg-gray-50 rounded-lg p-3 md:p-4 text-gray-900">
                <p className="text-gray-900 text-xs md:text-sm">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Status Update Buttons */}
          {order.order_status !== 'new' && order.order_status !== 'cancelled' && order.order_status !== 'delivered' && (
            <div className="border-t-2 border-gray-200 pt-3 md:pt-4">
              <h3 className="font-bold text-gray-900 mb-2 md:mb-3 text-sm md:text-base">Update Status</h3>
              <div className="flex flex-wrap gap-2">
                {order.order_status === 'confirmed' && (
                  <button
                    onClick={() => onUpdateStatus(order.id, 'packing')}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gray-800 to-black hover:from-gray-900 hover:to-black text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg border border-navy-900/20"
                  >
                    Mark as Packing
                  </button>
                )}
                {(order.order_status === 'packing' || order.order_status === 'processing') && (
                  <button
                    onClick={() => onUpdateStatus(order.id, 'out_for_delivery')}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-gray-800 to-black hover:from-gray-900 hover:to-black text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg border border-navy-900/20"
                  >
                    Mark as Out for Delivery
                  </button>
                )}
                {(order.order_status === 'out_for_delivery' || order.order_status === 'shipped') && (
                  <button
                    onClick={() => onUpdateStatus(order.id, 'delivered')}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    Mark as Delivered
                  </button>
                )}
                {(order.order_status === 'new' || order.order_status === 'confirmed' || order.order_status === 'packing' || order.order_status === 'processing') && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to cancel this order?')) {
                        onUpdateStatus(order.id, 'cancelled');
                      }
                    }}
                    disabled={isProcessing}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-xs md:text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrdersManager;
