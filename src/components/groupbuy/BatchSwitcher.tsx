import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { GroupBuyBatch, GroupBuyStatus } from '../../types';
import { formatDateTime } from './orderStatusStyles';

interface BatchSwitcherProps {
  batches: GroupBuyBatch[];
  selectedBatch: GroupBuyBatch | null;
  onSelect: (batchId: string) => void;
}

const STATUS_PILL: Record<GroupBuyStatus, string> = {
  open: 'bg-green-100 text-green-700',
  finalizing: 'bg-amber-100 text-amber-700',
  finalized: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

function batchLabel(batch: GroupBuyBatch): string {
  return `Batch #${batch.batch_number}${batch.name ? ` — ${batch.name}` : ''}`;
}

/**
 * Header dropdown that switches the batch in view. Shows the selected batch and
 * its status; the menu lists every batch newest-first with a status pill so the
 * admin can jump to any past or open batch without scrolling to a history list.
 */
export function BatchSwitcher({ batches, selectedBatch, onSelect }: BatchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndFocusTrigger();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Move focus into the menu when it opens so arrow keys work immediately.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = batches.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  const handleSelect = (batchId: string) => {
    onSelect(batchId);
    closeAndFocusTrigger();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:border-brand-300 transition-colors"
      >
        {selectedBatch ? (
          <>
            <span className="truncate max-w-[8rem] sm:max-w-[12rem]">{batchLabel(selectedBatch)}</span>
            <span
              className={`hidden sm:inline rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                STATUS_PILL[selectedBatch.status]
              }`}
            >
              {selectedBatch.status}
            </span>
          </>
        ) : (
          <span className="text-gray-500">No batch</span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && batches.length > 0 && (
        <div
          role="menu"
          aria-label="Select batch"
          className="absolute right-0 z-40 mt-1.5 w-72 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-luxury"
        >
          {batches.map((batch, index) => {
            const isSelected = batch.id === selectedBatch?.id;
            return (
              <button
                key={batch.id}
                ref={(el) => (itemRefs.current[index] = el)}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => handleSelect(batch.id)}
                onKeyDown={(e) => handleMenuKeyDown(e, index)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {isSelected && <Check className="h-4 w-4 text-brand-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-900">
                    {batchLabel(batch)}
                  </span>
                  <span className="block text-[10px] text-gray-400">
                    Opened {formatDateTime(batch.opened_at)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    STATUS_PILL[batch.status]
                  }`}
                >
                  {batch.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BatchSwitcher;
