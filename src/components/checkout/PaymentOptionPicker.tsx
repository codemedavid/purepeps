import React from 'react';
import { Banknote, CreditCard } from 'lucide-react';
import type { PaymentType } from '../../constants/payment';

interface PaymentOptionPickerProps {
    value: PaymentType;
    onChange: (next: PaymentType) => void;
    /** Cash the courier will collect, shown on the COD card so the choice is informed. */
    codAmount: number;
    /** When false, COD is switched off shop-wide and the card is disabled. */
    codAvailable?: boolean;
}

const OPTIONS: readonly {
    value: PaymentType;
    title: string;
    blurb: string;
    Icon: typeof CreditCard;
}[] = [
        {
            value: 'pay_now',
            title: 'Pay Now',
            blurb: 'Pay online via GCash or bank transfer, then upload your receipt.',
            Icon: CreditCard,
        },
        {
            value: 'cod',
            title: 'Cash on Delivery',
            blurb: 'Pay the courier in cash when your order arrives. Nothing to pay today.',
            Icon: Banknote,
        },
    ];

/**
 * How the customer wants to pay. Rendered as a radio group so the choice is
 * keyboard reachable and announced as a single "Payment option" group, rather
 * than as two unrelated buttons.
 */
const PaymentOptionPicker: React.FC<PaymentOptionPickerProps> = ({
    value,
    onChange,
    codAmount,
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
                                ? 'Cash on delivery is unavailable right now.'
                                : blurb}
                        </p>

                        {optionValue === 'cod' && !isDisabled && (
                            <p className="text-sm font-semibold text-charcoal-900 pl-8">
                                ₱{codAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} on arrival
                            </p>
                        )}
                    </label>
                );
            })}
        </div>
    </fieldset>
);

export default PaymentOptionPicker;
