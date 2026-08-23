import React from 'react';
import { Banknote, Truck } from 'lucide-react';

interface CodInstructionsProps {
    /** Exact cash the courier collects: order total plus shipping, no surcharge. */
    amountDue: number;
    courierName?: string | null;
}

/**
 * What a COD customer needs to know before placing the order. Deliberately
 * concrete about the amount — the single most common COD failure is the
 * customer not having the right cash ready when the courier arrives.
 */
const CodInstructions: React.FC<CodInstructionsProps> = ({ amountDue, courierName }) => {
    const formattedAmount = `₱${amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

    return (
        <div className="bg-white rounded shadow-clinical p-6 border border-gray-100">
            <h2 className="font-heading text-lg font-bold text-charcoal-900 mb-4 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-brand-600" />
                Cash on Delivery
            </h2>

            <div className="bg-brand-50/30 border border-brand-100 rounded-lg p-4 mb-4">
                <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-1">
                    Prepare this amount
                </p>
                <p className="text-2xl font-bold text-charcoal-900">{formattedAmount}</p>
                <p className="text-xs text-gray-500 mt-1">
                    Your order total plus shipping. There is no extra charge for paying on delivery.
                </p>
            </div>

            <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-3">
                    <span className="font-bold text-brand-500">1.</span>
                    <span>
                        Nothing to pay today — place your order and we will confirm it before
                        it ships.
                    </span>
                </li>
                <li className="flex items-start gap-3">
                    <span className="font-bold text-brand-500">2.</span>
                    <span>
                        Have {formattedAmount} in cash ready. Couriers usually cannot give change
                        for large bills.
                    </span>
                </li>
                <li className="flex items-start gap-3">
                    <Truck className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                        {courierName
                            ? `${courierName} will collect payment when they hand over your parcel.`
                            : 'The courier will collect payment when they hand over your parcel.'}
                    </span>
                </li>
                <li className="flex items-start gap-3">
                    <span className="font-bold text-brand-500">4.</span>
                    <span>
                        Please be reachable on the number you gave us so delivery is not delayed.
                    </span>
                </li>
            </ul>
        </div>
    );
};

export default CodInstructions;
