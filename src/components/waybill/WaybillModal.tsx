import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { WaybillData } from '../../utils/waybill';
import { Waybill } from './Waybill';

type Props = {
  /** One waybill for a single order, or many for a "print all confirmed" batch. */
  waybills: WaybillData[];
  onClose: () => void;
};

/**
 * Full-screen overlay that shows the waybill(s) on screen and, on Print, hands
 * only the waybill area to the browser's print dialog. The overlay chrome (close
 * button, print button, dark backdrop) carries `wb-no-print` and the print CSS in
 * index.css hides everything except `.waybill-print-area`, so the admin nav and
 * controls never appear on paper. Rendered through a portal on document.body to
 * escape any parent `overflow`/`z-index` stacking context.
 */
export function WaybillModal({ waybills, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const count = waybills.length;

  const overlay = (
    <div
      className="wb-overlay wb-no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Printable waybill"
      onClick={onClose}
    >
      <div className="wb-modal" onClick={(event) => event.stopPropagation()}>
        <div className="wb-toolbar wb-no-print">
          <span className="wb-toolbar-title">
            {count > 1 ? `${count} waybills ready to print` : 'Waybill'}
          </span>
          <div className="wb-toolbar-actions">
            <button type="button" className="wb-btn-print" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              className="wb-btn-close"
              onClick={onClose}
              aria-label="Close waybill"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="waybill-print-area">
          {waybills.map((data) => (
            <div className="wb-page" key={data.orderId}>
              <Waybill data={data} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export default WaybillModal;
