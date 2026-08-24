import { PackageX } from 'lucide-react';
import type { OrderHistoryLigwak } from '../../types';
import { ligwakRefundStatusColor, ligwakRefundStatusLabel } from '../../constants/ligwak';

interface LigwakNoticeProps {
  ligwak: readonly OrderHistoryLigwak[];
}

const peso = (value: number): string =>
  `₱${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function itemLabel(line: OrderHistoryLigwak): string {
  const name = line.product_name ?? 'Item';
  return line.variation_name ? `${name} — ${line.variation_name}` : name;
}

/**
 * Tells a customer, on their own Order History, that part of their order fell
 * outside a complete kit when the group buy closed.
 *
 * Two things this has to get right, because the reader is worried:
 *
 *   1. It must not read as "your order was cancelled". When some of the item
 *      still ships, the confirmed quantity is stated alongside the affected one.
 *
 *   2. It must not promise a reference number that does not exist yet. The
 *      reference row appears only once the refund actually has one.
 *
 * Renders nothing at all for an unaffected order, so it can be dropped into the
 * history card unconditionally.
 */
export function LigwakNotice({ ligwak }: LigwakNoticeProps) {
  if (!ligwak || ligwak.length === 0) return null;

  return (
    <section
      aria-labelledby="ligwak-notice-heading"
      className="rounded-xl border border-amber-300 bg-amber-50/70 p-4"
    >
      <div className="flex items-start gap-2.5">
        <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4
            id="ligwak-notice-heading"
            className="text-sm font-bold uppercase tracking-wide text-amber-900"
          >
            Ligwak — Incomplete Kit
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-amber-900/90">
            Your order, or part of your order, was included in an incomplete kit when the
            Group Buy closed. The affected quantity has been marked as Ligwak and will be
            processed according to the applicable refund method.
          </p>

          <ul className="mt-3 space-y-3">
            {ligwak.map((line, index) => (
              <li
                key={`${line.product_name ?? 'item'}-${line.variation_name ?? ''}-${index}`}
                className="rounded-lg border border-amber-200 bg-white/80 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-gray-900">{itemLabel(line)}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ligwakRefundStatusColor(
                      line.refund_status,
                    )}`}
                  >
                    {ligwakRefundStatusLabel(line.refund_status)}
                  </span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">Affected</dt>
                    <dd className="font-semibold text-amber-800">
                      {line.ligwak_quantity} {line.ligwak_quantity === 1 ? 'vial' : 'vials'}
                    </dd>
                  </div>

                  {/* Only when part of this item genuinely survived — otherwise a
                      "0 still confirmed" line reads as a taunt. */}
                  {line.confirmed_quantity > 0 && (
                    <div className="flex gap-1.5">
                      <dt className="text-gray-500">Still confirmed</dt>
                      <dd className="font-semibold text-green-700">
                        {line.confirmed_quantity}{' '}
                        {line.confirmed_quantity === 1 ? 'vial' : 'vials'}
                      </dd>
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">Expected refund</dt>
                    <dd className="font-semibold text-gray-900">{peso(line.refund_amount)}</dd>
                  </div>

                  {/* Promising a reference before one exists just invites a
                      "where is it?" message. */}
                  {line.refund_reference && (
                    <div className="flex gap-1.5">
                      <dt className="text-gray-500">Reference</dt>
                      <dd className="font-mono font-semibold text-gray-900">
                        {line.refund_reference}
                      </dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default LigwakNotice;
