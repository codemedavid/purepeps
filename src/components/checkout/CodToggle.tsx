import React, { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseCodEnabled } from '../../hooks/useCodAvailability';

/**
 * Shop-wide Cash on Delivery switch, surfaced beside the online payment methods
 * because that is where an admin looks for "how customers can pay".
 *
 * This writes site_settings.cod_enabled. It is a convenience, NOT the control:
 * checkout inserts run as anon straight against the table, so the binding rule
 * is the enforce_payment_type_on_order trigger (20260824000100). Turning this
 * off hides COD at checkout AND makes the server reject it.
 */
const CodToggle: React.FC = () => {
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('site_settings')
                .select('value')
                .eq('id', 'cod_enabled')
                .maybeSingle();
            if (cancelled) return;
            if (error) {
                console.error('Error reading cod_enabled:', error);
                setEnabled(true);
                return;
            }
            setEnabled(parseCodEnabled(data?.value));
        })();
        return () => { cancelled = true; };
    }, []);

    const toggle = async () => {
        if (enabled === null || saving) return;
        const next = !enabled;

        try {
            setSaving(true);
            const { error } = await supabase
                .from('site_settings')
                .upsert(
                    {
                        id: 'cod_enabled',
                        value: next ? 'true' : 'false',
                        type: 'boolean',
                        description:
                            'When false, Cash on Delivery is hidden at checkout and rejected server-side.',
                    },
                    { onConflict: 'id' },
                );
            if (error) throw error;
            setEnabled(next);
        } catch (err) {
            console.error('Error saving cod_enabled:', err);
            alert('Failed to update the Cash on Delivery setting. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-5 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                    <Banknote className="w-5 h-5 text-brand-600 mt-0.5" aria-hidden="true" />
                    <div>
                        <h3 className="font-bold text-gray-900">Cash on Delivery</h3>
                        <p className="text-xs text-gray-500 mt-1 max-w-prose">
                            When off, customers cannot choose Cash on Delivery at checkout. Orders
                            already placed are unaffected, and existing COD customers can still
                            claim batch leftovers.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={toggle}
                    disabled={enabled === null || saving}
                    role="switch"
                    aria-checked={enabled === true}
                    aria-label="Cash on Delivery available at checkout"
                    className={`px-4 py-2 rounded font-semibold text-sm transition-colors disabled:opacity-60 ${enabled
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-300'
                        }`}
                >
                    {enabled === null ? 'Loading…' : saving ? 'Saving…' : enabled ? 'On' : 'Off'}
                </button>
            </div>
        </div>
    );
};

export default CodToggle;
