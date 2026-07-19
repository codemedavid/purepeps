import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Boxes, Truck, RotateCcw } from 'lucide-react';
import { useGroupBuy } from '../hooks/useGroupBuy';
import { useBatchOrders } from '../hooks/useBatchOrders';
import { useBatchMembers } from '../hooks/useBatchMembers';
import { useTierCatalog } from '../hooks/useTierCatalog';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { useMenu } from '../hooks/useMenu';
import { FULFILLMENT_STAGES, fulfillmentStageLabel } from '../utils/orderTracking';
import {
  computeBatchKpis,
  summarizeCapFill,
  summarizeItemRevenue,
  ordersNeedingAction,
} from '../utils/groupBuyOverview';
import { topBuyersByEmail } from '../utils/batchMemberAnalytics';
import { groupBatchOrders, buildOrderSequenceContext } from '../utils/batchOrderGroups';
import { canReopenClosedBatch } from '../utils/groupBuy';
import { formatBatchLabel } from '../utils/waybill';
import { getActionErrorMessage } from '../utils/errorMessage';
import type { OrderSequenceContext } from '../utils/batchOrderGroups';
import type { BatchOrder, FulfillmentStage, OrderLineItem } from '../types';
import { BatchKpiStrip } from './groupbuy/BatchKpiStrip';
import { BatchSwitcher } from './groupbuy/BatchSwitcher';
import { GroupBuyTabs } from './groupbuy/GroupBuyTabs';
import type { GroupBuyTab } from './groupbuy/GroupBuyTabs';
import { BatchOverviewTab } from './groupbuy/BatchOverviewTab';
import { BatchOrdersPanel } from './groupbuy/BatchOrdersPanel';
import { BatchMembersPanel } from './groupbuy/BatchMembersPanel';
import { BatchOrderDetail } from './groupbuy/BatchOrderDetail';
import { BatchLeftoverPanel } from './groupbuy/BatchLeftoverPanel';
import { CapsProgressTable, capDraftKey } from './groupbuy/CapsProgressTable';
import { BatchCloseoutPanel } from './groupbuy/BatchCloseoutPanel';
import { OpenBatchModal } from './groupbuy/OpenBatchModal';
import type { OpenBatchValues } from './groupbuy/OpenBatchModal';
import { EditBatchModal } from './groupbuy/EditBatchModal';
import type { BatchTierOption, EditBatchValues } from './groupbuy/EditBatchModal';
import { ConfirmDialog } from './groupbuy/ConfirmDialog';
import type { ConfirmRequest, RequestConfirm } from './groupbuy/ConfirmDialog';
import { formatDateTime } from './groupbuy/orderStatusStyles';

interface GroupBuyManagerProps {
  onBack: () => void;
}

type ConfirmState = ConfirmRequest & { open: boolean };

function GroupBuyManager({ onBack }: GroupBuyManagerProps) {
  const {
    activeBatch,
    batches,
    progress,
    loading,
    error,
    openBatch,
    closeBatch,
    startFinalizing,
    finalizeBatch,
    reopenBatch,
    fetchBatchRemaining,
    setCap,
    removeCap,
    setFulfillmentStage,
    fetchProgress,
    fetchOfferableTiers,
    fetchBatchTierIds,
    updateBatchSettings,
    setPasaloMode,
    setViewOnlyMode,
  } = useGroupBuy();
  const { products } = useMenu();

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({});
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GroupBuyTab>('overview');
  const [openModal, setOpenModal] = useState<{ open: boolean; closesCurrent: boolean }>({
    open: false,
    closesCurrent: false,
  });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [editState, setEditState] = useState<{
    open: boolean;
    tiers: BatchTierOption[];
    selectedTierIds: string[];
  }>({ open: false, tiers: [], selectedTierIds: [] });

  // One shared confirm dialog serves every destructive/lifecycle action.
  const requestConfirm = useCallback<RequestConfirm>((request) => {
    setConfirmState({ ...request, open: true });
  }, []);
  const closeConfirm = useCallback(() => setConfirmState(null), []);

  // Prefer explicit selection, then the open batch, then the most recent batch
  // (batches are ordered batch_number DESC) so fulfillment views survive after a
  // batch leaves the open state.
  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? activeBatch ?? batches[0] ?? null,
    [batches, selectedBatchId, activeBatch],
  );

  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    reload: reloadOrders,
    confirmOrder,
    verifyAdditionalPayment,
    attachAdminPaymentProof,
    updateStatus,
    cancelOrder,
    saveTracking,
    saveItems,
    addLinkedOrder,
    bulkUpdateStatus,
  } = useBatchOrders(selectedBatch?.id ?? null);

  const {
    members: batchMembers,
    loading: membersLoading,
    reload: reloadMembers,
  } = useBatchMembers(selectedBatch?.id ?? null);
  const { tiers: tierCatalog } = useTierCatalog();
  const { setTier } = useAccessRequests();

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  // Sequence context for the open order, so a repeat purchase shows "Order 2 of 3
  // · Reference PP-0001" with sibling links. Null for a lone order — the detail
  // view then renders unchanged.
  const orderSequence = useMemo<OrderSequenceContext | null>(() => {
    if (!selectedOrder) return null;
    const group = groupBatchOrders(orders).find((g) =>
      g.allOrders.some((o) => o.id === selectedOrder.id),
    );
    if (!group || !group.isMulti) return null;
    return buildOrderSequenceContext(group, selectedOrder.id);
  }, [orders, selectedOrder]);

  const kpis = useMemo(() => computeBatchKpis(orders), [orders]);
  const needsAction = useMemo(() => ordersNeedingAction(orders), [orders]);
  // Per-item closeout (orders, units, gross vs collected revenue) derived from the
  // batch's own orders, so it stays correct once a batch is finalized/closed.
  const itemRevenue = useMemo(() => summarizeItemRevenue(orders), [orders]);
  // Leaderboard of who spent the most on products this batch, grouped by email.
  const topBuyers = useMemo(() => topBuyersByEmail(orders), [orders]);

  // Live progress is only fetched for the open/finalizing batch, so on a
  // closed/finalized batch `progress.items` still holds the previous batch's
  // numbers. Only summarize caps when they actually belong to the batch in view.
  const capsApplyToSelected =
    selectedBatch != null &&
    (selectedBatch.id === activeBatch?.id || selectedBatch.status === 'finalizing');
  const capSummary = useMemo(
    () => summarizeCapFill(capsApplyToSelected ? progress.items : []),
    [progress.items, capsApplyToSelected],
  );

  // Reset cap drafts when the active batch changes so values never leak across batches.
  useEffect(() => {
    setCapDrafts({});
  }, [activeBatch?.id]);

  // Seed cap drafts from server caps (product- and variation-level) without
  // clobbering a value being typed.
  useEffect(() => {
    setCapDrafts((prev) => {
      const next = { ...prev };
      for (const item of progress.items) {
        const productKey = capDraftKey(item.product_id);
        if (item.cap_quantity != null && !(productKey in next)) {
          next[productKey] = String(item.cap_quantity);
        }
        for (const variation of item.variations ?? []) {
          const variationKey = capDraftKey(item.product_id, variation.variation_id);
          if (variation.cap_quantity != null && !(variationKey in next)) {
            next[variationKey] = String(variation.cap_quantity);
          }
        }
      }
      return next;
    });
  }, [progress.items]);

  // refresh() only fetches progress for the OPEN batch, so re-fetch progress for
  // whichever batch is selected when its totals are shown (open = editable,
  // finalizing = read-only) so the table reflects the batch in view.
  const selectedBatchId2 = selectedBatch?.id ?? null;
  const selectedBatchStatus = selectedBatch?.status;
  const selectedBatchIsOpen = selectedBatchId2 != null && selectedBatchId2 === activeBatch?.id;
  useEffect(() => {
    if (selectedBatchId2 && (selectedBatchIsOpen || selectedBatchStatus === 'finalizing')) {
      void fetchProgress(selectedBatchId2).catch((err) => {
        console.error('Failed to fetch batch progress:', err);
      });
    }
  }, [selectedBatchId2, selectedBatchStatus, selectedBatchIsOpen, fetchProgress]);

  // Returns whether the action succeeded so callers (e.g. the items editor) can
  // avoid optimistic UI resets when a save actually failed.
  const runAction = async (fn: () => Promise<void>): Promise<boolean> => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (err) {
      console.error('Group buy action failed:', err);
      // Supabase errors are plain objects (not Error instances), so surface their
      // real message — e.g. the batch-cap trigger's "Group buy limit reached
      // (cap X, already reserved Y, you requested Z)." — instead of a generic one.
      setActionError(getActionErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // ---- Open-batch modal ----
  const handleOpenBatch = () => setOpenModal({ open: true, closesCurrent: false });
  const handleOpenNewBatch = () => setOpenModal({ open: true, closesCurrent: true });
  const submitOpenBatch = ({ name, startsAt, endsAt }: OpenBatchValues) => {
    setOpenModal((prev) => ({ ...prev, open: false }));
    // Access tiers default to the server's active set at each tier's own price,
    // so the open form passes no tier/price overrides.
    void runAction(() => openBatch(name ?? undefined, startsAt, endsAt));
  };

  // ---- Edit-settings modal (open batch only) ----
  // Load the offerable tiers + the batch's current selection before opening, so
  // the modal seeds its checkboxes from server truth rather than stale state.
  const handleEditSettings = () => {
    if (!activeBatch) return;
    void runAction(async () => {
      const [tiers, selectedTierIds] = await Promise.all([
        fetchOfferableTiers(),
        fetchBatchTierIds(activeBatch.id),
      ]);
      setEditState({ open: true, tiers, selectedTierIds });
    });
  };

  const closeEditModal = () => setEditState((prev) => ({ ...prev, open: false }));

  const submitEditSettings = (values: EditBatchValues) => {
    if (!activeBatch) return;
    closeEditModal();
    void runAction(() => updateBatchSettings(activeBatch.id, values));
  };

  // ---- Lifecycle handlers (confirmation lives in the lifecycle bar) ----
  const handleStartFinalizing = (batchId: string) => void runAction(() => startFinalizing(batchId));
  const handleFinalize = (batchId: string) => void runAction(() => finalizeBatch(batchId));
  const handleReopen = (batchId: string) => void runAction(() => reopenBatch(batchId));
  const handleClose = (batchId: string) => void runAction(() => closeBatch(batchId));

  // ---- Cap handlers (open batch only) ----
  // variationId null/undefined = product-level cap; a value = that variation's cap.
  const handleCapDraftChange = (productId: string, value: string, variationId?: string | null) => {
    const key = capDraftKey(productId, variationId);
    setCapDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveCap = (productId: string, variationId?: string | null) => {
    if (!activeBatch) return;
    const raw = (capDrafts[capDraftKey(productId, variationId)] ?? '').trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      setActionError('Cap must be a whole number greater than 0.');
      return;
    }
    void runAction(() => setCap(activeBatch.id, productId, Math.floor(value), variationId ?? null));
  };

  const handleRemoveCap = (productId: string, variationId?: string | null) => {
    if (!activeBatch) return;
    void runAction(() => removeCap(activeBatch.id, productId, variationId ?? null));
  };

  const handleTogglePasaloMode = () => {
    if (!activeBatch) return;
    void runAction(() => setPasaloMode(activeBatch.id, !activeBatch.pasalo_mode));
  };

  const handleToggleViewOnlyMode = () => {
    if (!activeBatch) return;
    void runAction(() => setViewOnlyMode(activeBatch.id, !activeBatch.view_only_mode));
  };

  // ---- Shipment stage (shared international leg for the whole batch) ----
  const handleSetStage = (stage: FulfillmentStage | null) => {
    if (!selectedBatch) return;
    const label = fulfillmentStageLabel(stage);
    requestConfirm({
      title: stage ? `Set shipment stage to "${label}"?` : 'Reset the shipment stage?',
      message: `Every customer in Batch #${selectedBatch.batch_number} sees this on their order tracking page.`,
      confirmLabel: stage ? 'Update stage' : 'Reset',
      tone: stage ? 'default' : 'danger',
      onConfirm: () => void runAction(() => setFulfillmentStage(selectedBatch.id, stage)),
    });
  };

  // ---- Order detail handlers ----
  const handleConfirmOrder = (order: BatchOrder) => void runAction(() => confirmOrder(order));
  const handleUpdateStatus = (orderId: string, status: string) =>
    void runAction(() => updateStatus(orderId, status));
  const handleCancelOrder = (orderId: string) => void runAction(() => cancelOrder(orderId));
  const handleSaveTracking = (
    orderId: string,
    tracking: { tracking_number: string | null; shipping_provider: string | null; shipping_note: string | null },
  ) => void runAction(() => saveTracking(orderId, tracking));
  // Corrections to existing lines (keptItems) update this order in place; brand-new
  // products (addedItems) spawn a separate linked order with its own payment so the
  // customer's reference gathers multiple independently-confirmed orders.
  const handleSaveItems = (
    orderId: string,
    keptItems: OrderLineItem[],
    addedItems: OrderLineItem[],
  ): Promise<boolean> =>
    runAction(async () => {
      const existing = orders.find((o) => o.id === orderId);
      const keptChanged =
        existing != null && JSON.stringify(existing.order_items) !== JSON.stringify(keptItems);
      if (keptChanged) {
        await saveItems(orderId, keptItems);
      }
      if (existing && addedItems.length > 0) {
        // Jump to the freshly created linked order so the admin can see it saved
        // (and can confirm its payment) instead of being left on the parent with
        // the added line silently gone.
        const newOrderId = await addLinkedOrder(existing, addedItems);
        if (newOrderId) {
          setSelectedOrderId(newOrderId);
        }
      }
    });
  const handleVerifyBalance = (orderId: string) =>
    void runAction(() => verifyAdditionalPayment(orderId));
  const handleAttachProof = (orderId: string, proofUrl: string) =>
    void runAction(() => attachAdminPaymentProof(orderId, proofUrl));
  const handleBulkUpdate = (orderIds: string[], status: string) =>
    void runAction(() => bulkUpdateStatus(orderIds, status));

  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    setSelectedOrderId(null);
  };

  const handleViewOrder = (order: BatchOrder) => {
    setSelectedOrderId(order.id);
  };

  // Catalog products UNION any product with orders/caps in this batch but no
  // longer in the catalog, so reserved units never become invisible.
  const rows = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const product of products) byId.set(product.id, { id: product.id, name: product.name });
    for (const item of progress.items) {
      if (!byId.has(item.product_id)) {
        byId.set(item.product_id, { id: item.product_id, name: item.product_name || '(removed product)' });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, progress.items]);

  // Variations per catalog product, so the caps table can expand a product to cap
  // its variations. Only products with 2+ variations are worth expanding.
  const variationsByProduct = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = {};
    for (const product of products) {
      const variations = product.variations ?? [];
      if (variations.length > 0) {
        map[product.id] = variations.map((v) => ({ id: v.id, name: v.name }));
      }
    }
    return map;
  }, [products]);

  const isOpenBatchSelected = activeBatch != null && selectedBatch?.id === activeBatch.id;
  const isFinalizing = selectedBatch?.status === 'finalizing';
  // Reopen is offered for a CLOSED batch only when it is the latest one, so old
  // archived batches stay archived (the RPC enforces the same rule server-side).
  const canReopenClosed = selectedBatch != null && canReopenClosedBatch(selectedBatch, batches);
  const combinedError = actionError || error || ordersError;
  const tabBadges: Partial<Record<GroupBuyTab, number>> = {
    overview: kpis.toConfirmCount,
    orders: kpis.activeOrders,
    members: batchMembers.length,
  };

  const lifecycleHandlers = {
    requestConfirm,
    onOpenBatch: handleOpenBatch,
    onOpenNewBatch: handleOpenNewBatch,
    onStartFinalizing: handleStartFinalizing,
    onFinalize: handleFinalize,
    onReopen: handleReopen,
    onClose: handleClose,
  };

  return (
    <div className="min-h-screen bg-sakura-canvas">
      {/* Sticky command bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between gap-2 h-12 md:h-14">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to Dashboard"
                className="text-gray-700 hover:text-brand-400 transition-colors flex items-center gap-1 group shrink-0"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline text-xs md:text-sm">Dashboard</span>
              </button>
              <h1 className="text-sm md:text-base font-bold text-sakura-ink flex items-center gap-1.5 shrink-0">
                <Boxes className="h-4 w-4 text-brand-400" />
                Group Buy
              </h1>
            </div>
            {batches.length > 0 && (
              <BatchSwitcher
                batches={batches}
                selectedBatch={selectedBatch}
                onSelect={handleSelectBatch}
              />
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        {combinedError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {combinedError}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-sm text-gray-500">Loading…</p>
          </div>
        ) : selectedOrder ? (
          <BatchOrderDetail
            order={selectedOrder}
            products={products}
            busy={busy}
            adminFee={selectedBatch?.access_fee ?? null}
            batchLabel={formatBatchLabel(selectedBatch?.batch_number, selectedBatch?.name)}
            sequence={orderSequence}
            onSelectSibling={setSelectedOrderId}
            canAddOrder={isOpenBatchSelected}
            requestConfirm={requestConfirm}
            onBack={() => setSelectedOrderId(null)}
            onConfirm={handleConfirmOrder}
            onUpdateStatus={handleUpdateStatus}
            onCancel={handleCancelOrder}
            onSaveTracking={handleSaveTracking}
            onSaveItems={handleSaveItems}
            onVerifyBalance={handleVerifyBalance}
            onAttachProof={handleAttachProof}
          />
        ) : !selectedBatch ? (
          <BatchOverviewTab
            batch={null}
            capSummary={capSummary}
            items={[]}
            needsAction={[]}
            busy={busy}
            onViewOrder={handleViewOrder}
            onGoToOrders={() => setActiveTab('orders')}
            {...lifecycleHandlers}
          />
        ) : (
          <>
            <BatchKpiStrip kpis={kpis} />
            <GroupBuyTabs active={activeTab} onChange={setActiveTab} badges={tabBadges} />

            <div
              role="tabpanel"
              id={`gb-tabpanel-${activeTab}`}
              aria-labelledby={`gb-tab-${activeTab}`}
              tabIndex={0}
              className="focus:outline-none"
            >
            {activeTab === 'overview' && (
              <BatchOverviewTab
                batch={selectedBatch}
                capSummary={capSummary}
                items={capsApplyToSelected ? progress.items : []}
                orders={orders}
                itemRevenue={itemRevenue}
                needsAction={needsAction}
                busy={busy}
                canReopenClosed={canReopenClosed}
                onViewOrder={handleViewOrder}
                onGoToOrders={() => setActiveTab('orders')}
                onEditSettings={handleEditSettings}
                {...lifecycleHandlers}
              />
            )}

            {activeTab === 'orders' && (
              <BatchOrdersPanel
                batchNumber={selectedBatch.batch_number}
                orders={orders}
                loading={ordersLoading}
                busy={busy}
                adminFee={selectedBatch.access_fee ?? null}
                batchLabel={formatBatchLabel(selectedBatch.batch_number, selectedBatch.name)}
                requestConfirm={requestConfirm}
                onReload={reloadOrders}
                onSelectOrder={handleViewOrder}
                onBulkUpdateStatus={handleBulkUpdate}
              />
            )}

            {activeTab === 'members' && (
              <BatchMembersPanel
                batchNumber={selectedBatch.batch_number}
                members={batchMembers}
                loading={membersLoading}
                onReload={reloadMembers}
                tiers={tierCatalog}
                onSetTier={setTier}
                topBuyers={topBuyers}
                orders={orders}
              />
            )}

            {activeTab === 'caps' &&
              (isOpenBatchSelected || isFinalizing ? (
                <div className="space-y-4">
                  {isOpenBatchSelected && activeBatch && (
                    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">View-only mode</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          When on, shoppers can browse products and open details but Add-to-Cart is
                          disabled everywhere (shown as "Coming soon"). Flip it off to allow adding
                          now — a pre-launch phase where people can look before the drop goes live.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={activeBatch.view_only_mode ?? false}
                        aria-label="Toggle view-only mode"
                        disabled={busy}
                        onClick={handleToggleViewOnlyMode}
                        className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                          activeBatch.view_only_mode ? 'bg-brand-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            activeBatch.view_only_mode ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                  {isOpenBatchSelected && activeBatch && (
                    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Pasalo mode</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          When on, the storefront shows only capped products that still have
                          remaining slots — for a re-opening phase where shoppers see just the
                          items that still need orders.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={activeBatch.pasalo_mode ?? false}
                        aria-label="Toggle pasalo mode"
                        disabled={busy}
                        onClick={handleTogglePasaloMode}
                        className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                          activeBatch.pasalo_mode ? 'bg-brand-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            activeBatch.pasalo_mode ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                  <CapsProgressTable
                    rows={rows}
                    items={progress.items}
                    variationsByProduct={variationsByProduct}
                    capDrafts={capDrafts}
                    busy={busy}
                    onCapDraftChange={handleCapDraftChange}
                    onSaveCap={handleSaveCap}
                    onRemoveCap={handleRemoveCap}
                    readOnly={!isOpenBatchSelected}
                  />
                </div>
              ) : itemRevenue.rows.length > 0 ? (
                // Closed/finalized: live caps are gone, but the per-product closeout
                // (final units + revenue, with CSV export) is what the admin needs to
                // order from the supplier. Same panel as the Overview tab.
                <BatchCloseoutPanel
                  summary={itemRevenue}
                  orders={orders}
                  fulfillmentStage={selectedBatch.fulfillment_stage ?? null}
                  batchNumber={selectedBatch.batch_number}
                />
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
                  <p className="text-sm font-semibold text-gray-900">No per-product totals yet</p>
                  <p className="mt-1 text-xs text-gray-500">
                    This batch has no orders to total. Batch #{selectedBatch.batch_number} is{' '}
                    {selectedBatch.status}.
                  </p>
                </div>
              ))}

            {activeTab === 'shipping' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Truck className="h-4 w-4 text-brand-400" />
                        Shipment stage — Batch #{selectedBatch.batch_number}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Updates the international leg (supplier → Philippines) for every order in
                        this batch at once. Per-order local delivery is managed from each order.
                      </p>
                    </div>
                    <span className="self-start px-2.5 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-500 whitespace-nowrap">
                      {fulfillmentStageLabel(selectedBatch.fulfillment_stage)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FULFILLMENT_STAGES.map((stage) => {
                      const isCurrent = selectedBatch.fulfillment_stage === stage.value;
                      return (
                        <button
                          key={stage.value}
                          type="button"
                          onClick={() => handleSetStage(stage.value)}
                          disabled={busy || isCurrent}
                          className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                            isCurrent
                              ? 'bg-brand-400 text-white border-brand-400 cursor-default'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-300'
                          }`}
                        >
                          {stage.label}
                        </button>
                      );
                    })}
                    {selectedBatch.fulfillment_stage && (
                      <button
                        type="button"
                        onClick={() => handleSetStage(null)}
                        disabled={busy}
                        className="px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {isFinalizing && (
                  <BatchLeftoverPanel batchId={selectedBatch.id} fetchRemaining={fetchBatchRemaining} />
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Batch history</h3>
                {batches.length === 0 ? (
                  <p className="text-xs text-gray-400">No batches yet.</p>
                ) : (
                  <div className="space-y-1">
                    {batches.map((batch) => {
                      const isSelected = selectedBatch?.id === batch.id;
                      return (
                        <div
                          key={batch.id}
                          className={`flex flex-wrap items-center justify-between gap-2 py-1.5 px-2 rounded text-xs ${
                            isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className="font-medium text-gray-700">
                            Batch #{batch.batch_number}
                            {batch.name ? ` — ${batch.name}` : ''}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-400">{formatDateTime(batch.opened_at)}</span>
                            {batch.fulfillment_stage && (
                              <span className="px-2 py-0.5 rounded-full font-medium bg-brand-50 text-brand-500">
                                {fulfillmentStageLabel(batch.fulfillment_stage)}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 text-gray-600">
                              {batch.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectBatch(batch.id)}
                              disabled={isSelected}
                              className="px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-brand-300 disabled:opacity-40 disabled:cursor-default"
                            >
                              {isSelected ? 'Viewing' : 'View'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          </>
        )}
      </div>

      <OpenBatchModal
        open={openModal.open}
        busy={busy}
        closesCurrent={openModal.closesCurrent}
        onSubmit={submitOpenBatch}
        onCancel={() => setOpenModal((prev) => ({ ...prev, open: false }))}
      />

      {activeBatch && (
        <EditBatchModal
          open={editState.open}
          busy={busy}
          batch={activeBatch}
          tiers={editState.tiers}
          selectedTierIds={editState.selectedTierIds}
          onSubmit={submitEditSettings}
          onCancel={closeEditModal}
        />
      )}

      <ConfirmDialog
        open={confirmState?.open ?? false}
        title={confirmState?.title ?? ''}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        tone={confirmState?.tone}
        busy={busy}
        onCancel={closeConfirm}
        onConfirm={() => {
          confirmState?.onConfirm();
          closeConfirm();
        }}
      />
    </div>
  );
}

export default GroupBuyManager;
