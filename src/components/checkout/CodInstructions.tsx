import React from 'react';
import { Banknote } from 'lucide-react';

interface CodInstructionsProps {
    /** Exact cash the courier collects: the shipping fee only, no surcharge. */
    amountDue: number;
    courierName?: string | null;
}

/**
 * What a shopper paying the shipping fee on delivery needs to know before
 * placing the order.
 *
 * Deliberately concrete about the amount, and equally deliberate that it is
 * ONLY the shipping fee: the items are paid online moments from now, and a
 * shopper who expects the courier to want the whole order total will either
 * bring far too much cash or refuse the parcel.
 */
const CodInstructions: React.FC<CodInstructionsProps> = ({ amountDue, courierName }) => {
    const formattedAmount = `₱${amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

    return (
        <div className="bg-white rounded shadow-clinical p-6 border border-gray-100">
            <h2 className="font-heading text-lg font-bold text-charcoal-900 mb-4 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-brand-600" />
                Shipping Fee on Delivery
            </h2>

            <div className="bg-brand-50/30 border border-brand-100 rounded-lg p-4 mb-4">
                <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-1">
                    Cash to prepare
                </p>
                <p className="text-2xl font-bold text-charcoal-900">{formattedAmount}</p>
                <p className="text-xs text-gray-500 mt-1">
                    This is your shipping fee only — your items are paid online when you place
                    this order. There is no extra charge for settling the fee on delivery.
                </p>
            </div>

            <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-3">
                    <span className="font-bold text-brand-500">1.</span>
                    <span>
                        Pay for your items online now and upload your receipt, exactly as
                        usual. Only the shipping fee is left outstanding.
                    </span>
                </li>
                <li className="flex items-start gap-3">
                    <span className="font-bold text-brand-500">2.</span>
                    <span>
                        Have {formattedAmount} in cash ready on delivery day. Couriers usually
                        cannot give change for large bills.
                    </span>
                </li>
                <li className="flex items-start gap-3">
                    <span className="font-bold text-brand-500">3.</span>
                    <span>
                        {courierName
                            ? `${courierName} will collect the ${formattedAmount} fee when they hand over your parcel.`
                            : `The courier will collect the ${formattedAmount} fee when they hand over your parcel.`}
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
