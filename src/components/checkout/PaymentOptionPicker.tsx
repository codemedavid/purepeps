import React from 'react';
import { Banknote, CreditCard } from 'lucide-react';
import type { PaymentType } from '../../constants/payment';

interface PaymentOptionPickerProps {
    value: PaymentType;
    onChange: (next: PaymentType) => void;
    /** Items after discount, excluding shipping. Paid online under BOTH options. */
    itemsTotal: number;
    /** The shipping fee — the only figure this choice actually moves. */
    shippingFee: number;
    /** When false, COD is switched off shop-wide and the card is disabled. */
    codAvailable?: boolean;
}

const peso = (amount: number): string =>
    `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const OPTIONS: readonly {
    value: PaymentType;
    title: string;
    blurb: string;
    Icon: typeof CreditCard;
}[] = [
        {
            value: 'pay_now',
            title: 'Pay Now',
            blurb: 'Settle the shipping fee together with your items in one transfer.',
            Icon: CreditCard,
        },
        {
            value: 'cod',
            title: 'Shipping Fee on Delivery',
            blurb: 'Pay for your items now and hand the shipping fee to the courier in cash.',
            Icon: Banknote,
        },
    ];

/**
 * How the customer wants to handle the SHIPPING FEE.
 *
 * The items are bought online in both flows — this choice only decides whether
 * the fee rides along with that transfer or is handed to the courier in cash.
 * Each card therefore states what is paid online NOW, because the difference
 * between the two is otherwise invisible until the parcel arrives.
 *
 * Rendered as a radio group so the choice is keyboard reachable and announced
 * as a single group rather than as two unrelated buttons.
 */
const PaymentOptionPicker: React.FC<PaymentOptionPickerProps> = ({
    value,
    onChange,
    itemsTotal,
    shippingFee,
    codAvailable = true,
}) => (
    <fieldset className="bg-white rounded shadow-clinical p-6 border border-gray-100">
        <legend className="font-heading text-lg font-bold text-charcoal-900 mb-4 px-1">
            How would you like to pay?
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OPTIONS.map(({ value: optionValue, title, blurb, Icon }) => {
                const isSelected = value === optionValue;
                const isDisabled = optionValue === 'cod' && !codAvailable;

                return (
                    <label
                        key={optionValue}
                        className={`relative flex flex-col gap-2 p-4 rounded border transition-all ${isDisabled
                            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                            : isSelected
                                ? 'border-brand-500 bg-brand-50/20 ring-1 ring-brand-500 cursor-pointer'
                                : 'border-gray-200 hover:border-brand-300 cursor-pointer'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <input
                                type="radio"
                                name="paymentType"
                                value={optionValue}
                                checked={isSelected}
                                disabled={isDisabled}
                                onChange={() => onChange(optionValue)}
                                className="text-brand-600 focus:ring-brand-500"
                            />
                            <Icon
                                className={`w-5 h-5 ${isSelected ? 'text-brand-600' : 'text-gray-400'}`}
                                aria-hidden="true"
                            />
                            <span className="font-bold text-charcoal-900">{title}</span>
                        </div>

                        <p className="text-xs text-gray-500 leading-relaxed pl-8">
                            {isDisabled
                                ? 'Paying the shipping fee on delivery is unavailable right now.'
                                : blurb}
                        </p>

                        {!isDisabled && (
                            <p className="text-sm pl-8 leading-relaxed">
                                <span className="font-semibold text-charcoal-900">
                                    {peso(
                                        optionValue === 'pay_now'
                                            ? itemsTotal + shippingFee
                                            : itemsTotal,
                                    )}{' '}
                                    online now
                                </span>
                                {optionValue === 'cod' && (
                                    <span className="block text-charcoal-900">
                                        + {peso(shippingFee)} cash on arrival
                                    </span>
                                )}
                            </p>
                        )}
                    </label>
                );
            })}
        </div>
    </fieldset>
);

export default PaymentOptionPicker;
