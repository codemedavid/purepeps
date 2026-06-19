import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Boxes, Truck } from 'lucide-react';
import { useGroupBuy } from '../hooks/useGroupBuy';
import { useBatchOrders } from '../hooks/useBatchOrders';
import { useMenu } from '../hooks/useMenu';
import { FULFILLMENT_STAGES, fulfillmentStageLabel } from '../utils/orderTracking';
import type { BatchOrder, FulfillmentStage, OrderLineItem } from '../types';
import { BatchLifecycleBar } from './groupbuy/BatchLifecycleBar';
import { BatchOrdersPanel } from './groupbuy/BatchOrdersPanel';
import { BatchOrderDetail } from './groupbuy/BatchOrderDetail';
import { BatchLeftoverPanel } from './groupbuy/BatchLeftoverPanel';
import { CapsProgressTable } from './groupbuy/CapsProgressTable';
import { formatDateTime } from './groupbuy/orderStatusStyles';

interface GroupBuyManagerProps {
  onBack: () => void;
}

const STATUS_PILL_CLASS: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  finalizing: 'bg-amber-100 text-amber-700',
  finalized: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

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

  // Prefer explicit selection, then the open batch, then the most recent batch
  // (batches are ordered batch_number DESC) — fulfillment usually happens after
  // a batch leaves the open state, so we must not lose the view then.
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

  // refresh() only fetches progress for the OPEN batch, so the per-product totals
  // table goes blank once a batch enters `finalizing`, and `progress` can hold stale
  // data after viewing a different batch. Re-fetch progress for whichever batch is
  // selected when its totals are actually shown (open = editable, finalizing =
  // read-only) so the table reflects the batch in view.
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

  // ---- Lifecycle handlers ----
  const handleOpenBatch = () => {
    const name =
      window.prompt('Optional name for this group buy batch (leave blank for none):') ?? undefined;
    void runAction(() => openBatch(name));
  };

  const handleOpenNewBatch = () => {
    if (
      !window.confirm(
        'This will CLOSE the current batch and start a brand-new one. Orders already placed stay attached to the closed batch. Continue?',
      )
    ) {
      return;
    }
    const name = window.prompt('Optional name for the new batch:') ?? undefined;
    void runAction(() => openBatch(name));
  };

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

  // ---- Shipment stage ----
  const handleSetStage = (stage: FulfillmentStage | null) => {
    if (!selectedBatch) return;
    const label = fulfillmentStageLabel(stage);
    if (
      !window.confirm(
        `Set Batch #${selectedBatch.batch_number} to "${label}"? Every customer in this batch will see this on their order tracking page.`,
      )
    ) {
      return;
    }
    void runAction(() => setFulfillmentStage(selectedBatch.id, stage));
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between h-12 md:h-14">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onBack}
                className="text-gray-700 hover:text-brand-400 transition-colors flex items-center gap-1 group"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs md:text-sm">Dashboard</span>
              </button>
              <h1 className="text-sm md:text-base font-bold text-navy-900 flex items-center gap-1.5">
                <Boxes className="h-4 w-4 text-indigo-600" />
                Group Buy
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        {combinedError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {combinedError}
          </div>
        )}

        {selectedOrder ? (
          <BatchOrderDetail
            order={selectedOrder}
            products={products}
            busy={busy}
            onBack={() => setSelectedOrderId(null)}
            onConfirm={handleConfirmOrder}
            onUpdateStatus={handleUpdateStatus}
            onCancel={handleCancelOrder}
            onSaveTracking={handleSaveTracking}
            onSaveItems={handleSaveItems}
          />
        ) : (
          <>
            {loading ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-sm text-gray-500">Loading…</p>
              </div>
            ) : (
              <BatchLifecycleBar
                batch={selectedBatch}
                busy={busy}
                onOpenBatch={handleOpenBatch}
                onOpenNewBatch={handleOpenNewBatch}
                onStartFinalizing={handleStartFinalizing}
                onFinalize={handleFinalize}
                onReopen={handleReopen}
                onClose={handleClose}
              />
            )}

            {/* Shipment stage — shared international leg for the whole batch */}
            {selectedBatch && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-indigo-600" />
                      Shipment stage — Batch #{selectedBatch.batch_number}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Updates the international leg (supplier → Philippines) for every order in this
                      batch at once. Per-order local delivery (packing → delivered) is managed below.
                    </p>
                  </div>
                  <span className="self-start px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 whitespace-nowrap">
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
                            ? 'bg-indigo-600 text-white border-indigo-600 cursor-default'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
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
                      className="px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Leftover claim panel — only while finalizing */}
            {isFinalizing && selectedBatch && (
              <BatchLeftoverPanel
                batchId={selectedBatch.id}
                fetchRemaining={fetchBatchRemaining}
              />
            )}

            {/* Per-product totals + caps. Editable for the OPEN batch; read-only
                (totals + cancelled breakdown) while a batch is finalizing so the
                admin keeps the per-product view while cancelling no-shows. */}
            {(isOpenBatchSelected || isFinalizing) && (
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
            )}

            {/* Orders in this batch — the headline management surface */}
            {selectedBatch && (
              <BatchOrdersPanel
                batchNumber={selectedBatch.batch_number}
                orders={orders}
                loading={ordersLoading}
                busy={busy}
                onReload={reloadOrders}
                onSelectOrder={(order) => setSelectedOrderId(order.id)}
                onBulkUpdateStatus={handleBulkUpdate}
              />
            )}

            {/* Batch history */}
            {batches.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Batch history</h3>
                <div className="space-y-1">
                  {batches.map((batch) => {
                    const isSelected = selectedBatch?.id === batch.id;
                    return (
                      <div
                        key={batch.id}
                        className={`flex flex-wrap items-center justify-between gap-2 py-1.5 px-2 rounded text-xs ${
                          isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium text-gray-700">
                          Batch #{batch.batch_number}
                          {batch.name ? ` — ${batch.name}` : ''}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-gray-400">{formatDateTime(batch.opened_at)}</span>
                          {batch.fulfillment_stage && (
                            <span className="px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700">
                              {fulfillmentStageLabel(batch.fulfillment_stage)}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold ${
                              STATUS_PILL_CLASS[batch.status] ?? 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {batch.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBatchId(batch.id);
                              setSelectedOrderId(null);
                            }}
                            disabled={isSelected}
                            className="px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-indigo-400 disabled:opacity-40 disabled:cursor-default"
                          >
                            {isSelected ? 'Viewing' : 'View orders'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default GroupBuyManager;
