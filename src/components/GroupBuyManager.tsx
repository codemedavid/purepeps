import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Boxes, Truck, RotateCcw } from 'lucide-react';
import { useGroupBuy } from '../hooks/useGroupBuy';
import { useBatchOrders } from '../hooks/useBatchOrders';
import { useMenu } from '../hooks/useMenu';
import { FULFILLMENT_STAGES, fulfillmentStageLabel } from '../utils/orderTracking';
import {
  computeBatchKpis,
  summarizeCapFill,
  ordersNeedingAction,
} from '../utils/groupBuyOverview';
import type { BatchOrder, FulfillmentStage, OrderLineItem } from '../types';
import { BatchKpiStrip } from './groupbuy/BatchKpiStrip';
import { BatchSwitcher } from './groupbuy/BatchSwitcher';
import { GroupBuyTabs } from './groupbuy/GroupBuyTabs';
import type { GroupBuyTab } from './groupbuy/GroupBuyTabs';
import { BatchOverviewTab } from './groupbuy/BatchOverviewTab';
import { BatchOrdersPanel } from './groupbuy/BatchOrdersPanel';
import { BatchOrderDetail } from './groupbuy/BatchOrderDetail';
import { BatchLeftoverPanel } from './groupbuy/BatchLeftoverPanel';
import { CapsProgressTable } from './groupbuy/CapsProgressTable';
import { OpenBatchModal } from './groupbuy/OpenBatchModal';
import type { OpenBatchValues } from './groupbuy/OpenBatchModal';
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
    updateStatus,
    cancelOrder,
    saveTracking,
    saveItems,
    bulkUpdateStatus,
  } = useBatchOrders(selectedBatch?.id ?? null);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const kpis = useMemo(() => computeBatchKpis(orders), [orders]);
  const needsAction = useMemo(() => ordersNeedingAction(orders), [orders]);

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

  // Seed cap drafts from server caps without clobbering a value being typed.
  useEffect(() => {
    setCapDrafts((prev) => {
      const next = { ...prev };
      for (const item of progress.items) {
        if (item.cap_quantity != null && !(item.product_id in next)) {
          next[item.product_id] = String(item.cap_quantity);
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

  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('Group buy action failed:', err);
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  // ---- Open-batch modal ----
  const handleOpenBatch = () => setOpenModal({ open: true, closesCurrent: false });
  const handleOpenNewBatch = () => setOpenModal({ open: true, closesCurrent: true });
  const submitOpenBatch = ({ name, accessFee }: OpenBatchValues) => {
    setOpenModal((prev) => ({ ...prev, open: false }));
    void runAction(() => openBatch(name ?? undefined, accessFee));
  };

  // ---- Lifecycle handlers (confirmation lives in the lifecycle bar) ----
  const handleStartFinalizing = (batchId: string) => void runAction(() => startFinalizing(batchId));
  const handleFinalize = (batchId: string) => void runAction(() => finalizeBatch(batchId));
  const handleReopen = (batchId: string) => void runAction(() => reopenBatch(batchId));
  const handleClose = (batchId: string) => void runAction(() => closeBatch(batchId));

  // ---- Cap handlers (open batch only) ----
  const handleCapDraftChange = (productId: string, value: string) => {
    setCapDrafts((prev) => ({ ...prev, [productId]: value }));
  };

  const handleSaveCap = (productId: string) => {
    if (!activeBatch) return;
    const raw = (capDrafts[productId] ?? '').trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      setActionError('Cap must be a whole number greater than 0.');
      return;
    }
    void runAction(() => setCap(activeBatch.id, productId, Math.floor(value)));
  };

  const handleRemoveCap = (productId: string) => {
    if (!activeBatch) return;
    void runAction(() => removeCap(activeBatch.id, productId));
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
  const handleSaveItems = (orderId: string, items: OrderLineItem[]) =>
    void runAction(() => saveItems(orderId, items));
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

  const isOpenBatchSelected = activeBatch != null && selectedBatch?.id === activeBatch.id;
  const isFinalizing = selectedBatch?.status === 'finalizing';
  const combinedError = actionError || error || ordersError;
  const tabBadges: Partial<Record<GroupBuyTab, number>> = {
    overview: kpis.toConfirmCount,
    orders: kpis.activeOrders,
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
            requestConfirm={requestConfirm}
            onBack={() => setSelectedOrderId(null)}
            onConfirm={handleConfirmOrder}
            onUpdateStatus={handleUpdateStatus}
            onCancel={handleCancelOrder}
            onSaveTracking={handleSaveTracking}
            onSaveItems={handleSaveItems}
          />
        ) : !selectedBatch ? (
          <BatchOverviewTab
            batch={null}
            capSummary={capSummary}
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
                needsAction={needsAction}
                busy={busy}
                onViewOrder={handleViewOrder}
                onGoToOrders={() => setActiveTab('orders')}
                {...lifecycleHandlers}
              />
            )}

            {activeTab === 'orders' && (
              <BatchOrdersPanel
                batchNumber={selectedBatch.batch_number}
                orders={orders}
                loading={ordersLoading}
                busy={busy}
                requestConfirm={requestConfirm}
                onReload={reloadOrders}
                onSelectOrder={handleViewOrder}
                onBulkUpdateStatus={handleBulkUpdate}
              />
            )}

            {activeTab === 'caps' &&
              (isOpenBatchSelected || isFinalizing ? (
                <CapsProgressTable
                  rows={rows}
                  items={progress.items}
                  capDrafts={capDrafts}
                  busy={busy}
                  onCapDraftChange={handleCapDraftChange}
                  onSaveCap={handleSaveCap}
                  onRemoveCap={handleRemoveCap}
                  readOnly={!isOpenBatchSelected}
                />
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
                  <p className="text-sm font-semibold text-gray-900">Per-product totals are paused</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Caps and live totals show while a batch is open or finalizing. Batch #
                    {selectedBatch.batch_number} is {selectedBatch.status}.
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
