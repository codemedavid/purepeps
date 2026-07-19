import { QRCodeSVG } from 'qrcode.react';
import { formatPriceWithDecimals } from '../../utils/currency';
import type { WaybillData } from '../../utils/waybill';

type Props = {
  data: WaybillData;
};

const NA = 'N/A';

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="wb-field">
      <span className="wb-field-label">{label}:</span> {value ?? NA}
    </p>
  );
}

/**
 * A single print-ready customer waybill / order summary, styled after a J&T
 * airway bill: strong black borders, dark text, a customer/shipping block, an
 * item table, a totals footer, and a QR encoding the order reference. Purely
 * presentational — it renders whatever buildWaybillData() produced and shows
 * "N/A" for any field the order does not carry.
 */
export function Waybill({ data }: Props) {
  const {
    customer,
    address,
    shipping,
    items,
    adminFee,
    itemsSubtotal,
    grandTotal,
  } = data;

  return (
    <article className="wb-sheet" aria-label={`Waybill for order ${data.orderNumber}`}>
      {/* Header */}
      <header className="wb-header">
        <div className="wb-header-main">
          <h1 className="wb-title">{data.title}</h1>
          <div className="wb-meta">
            <span>
              Order <strong className="wb-mono">#{data.orderNumber}</strong>
            </span>
            <span>Confirmed: {data.dateLabel}</span>
            {data.batchLabel && <span>{data.batchLabel}</span>}
            {data.isClaim && <span className="wb-tag">CLAIM ADD-ON</span>}
          </div>
        </div>
        <div className="wb-qr">
          <QRCodeSVG value={data.qrValue} size={92} level="M" />
          <span className="wb-qr-caption">Scan to track</span>
        </div>
      </header>

      <div className="wb-body">
        {/* Left column: customer, address, shipping, fees, receipt, payment */}
        <section className="wb-col-left">
          <div className="wb-block">
            <h2 className="wb-block-title">Customer</h2>
            <Field label="Name" value={customer.name} />
            <Field label="Contact" value={customer.contact} />
            <Field label="Email" value={customer.email} />
            {customer.contactMethod && (
              <Field label="FB / Messenger" value={customer.contactMethod} />
            )}
            {customer.stickerName && <Field label="Sticker" value={customer.stickerName} />}
          </div>

          <div className="wb-block">
            <h2 className="wb-block-title">Shipping address</h2>
            {address.hasAny ? (
              <>
                <Field label="Municipality / City" value={address.municipality} />
                <Field label="Province" value={address.province} />
                <Field label="Barangay" value={address.barangay} />
                <Field label="Street address" value={address.street} />
                <Field label="Postal code" value={address.postalCode} />
                {address.country && <Field label="Country" value={address.country} />}
                {address.region && <Field label="Region" value={address.region} />}
              </>
            ) : (
              <p className="wb-field">{NA}</p>
            )}
          </div>

          <div className="wb-block">
            <h2 className="wb-block-title">Shipping</h2>
            <Field label="Courier" value={shipping.courier} />
            <Field label="Method / note" value={shipping.method} />
            <Field label="Tracking #" value={shipping.trackingNumber} />
            <Field label="Shipping fee" value={formatPriceWithDecimals(shipping.fee)} />
          </div>

          {adminFee != null && (
            <div className="wb-block">
              <h2 className="wb-block-title">Admin fee</h2>
              <p className="wb-field">{formatPriceWithDecimals(adminFee)}</p>
            </div>
          )}

          <div className="wb-block">
            <h2 className="wb-block-title">Receipt / payment</h2>
            <Field label="Method" value={data.paymentMethod} />
            {data.receiptUrl ? (
              <p className="wb-field">
                <span className="wb-field-label">Receipt link:</span>{' '}
                <a href={data.receiptUrl} target="_blank" rel="noopener noreferrer">
                  Open receipt
                </a>
              </p>
            ) : (
              <Field label="Receipt link" value={null} />
            )}
            {data.additionalReceiptUrl && (
              <p className="wb-field">
                <span className="wb-field-label">Balance receipt:</span>{' '}
                <a href={data.additionalReceiptUrl} target="_blank" rel="noopener noreferrer">
                  Open receipt
                </a>
              </p>
            )}
            <p className="wb-field">
              <span className="wb-field-label">Payment confirmation:</span>{' '}
              <span className={data.isPaymentConfirmed ? 'wb-paid' : 'wb-unpaid'}>
                {data.isPaymentConfirmed ? '☑' : '☐'} {data.paymentStatusLabel}
              </span>
            </p>
          </div>
        </section>

        {/* Right column: item table + totals */}
        <section className="wb-col-right">
          <table className="wb-table">
            <thead>
              <tr>
                <th className="wb-th-item">Item</th>
                <th className="wb-th-num">Price</th>
                <th className="wb-th-num">Qty</th>
                <th className="wb-th-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="wb-empty">
                    No items on this order
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={index}>
                    <td className="wb-td-item">{item.name}</td>
                    <td className="wb-td-num">{formatPriceWithDecimals(item.price)}</td>
                    <td className="wb-td-num">{item.quantity}</td>
                    <td className="wb-td-num">{formatPriceWithDecimals(item.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className="wb-totals">
            <tbody>
              <tr>
                <td>Order total</td>
                <td className="wb-td-num">{formatPriceWithDecimals(itemsSubtotal)}</td>
              </tr>
              {adminFee != null && (
                <tr>
                  <td>Admin fee</td>
                  <td className="wb-td-num">{formatPriceWithDecimals(adminFee)}</td>
                </tr>
              )}
              <tr>
                <td>Shipping fee</td>
                <td className="wb-td-num">{formatPriceWithDecimals(shipping.fee)}</td>
              </tr>
              <tr className="wb-grand">
                <td>Grand total</td>
                <td className="wb-td-num">{formatPriceWithDecimals(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </article>
  );
}

export default Waybill;
