import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { createSharedResource } from '../lib/sharedResource';
import { useSharedResource } from './useSharedResource';

export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

async function fetchActivePaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Shared cache for the storefront's active payment methods (GetAccess, Checkout).
// Fetched once and reused, so the picker no longer flashes a loading state on
// every visit. The admin manager works on the *full* list (incl. inactive) and
// keeps it in instance-local state instead, so it never pollutes this cache.
const activeMethodsResource = createSharedResource<PaymentMethod[]>({
  fetcher: fetchActivePaymentMethods,
  initial: [],
});

export const usePaymentMethods = () => {
  const shared = useSharedResource(activeMethodsResource);

  // Admin override: when refetchAll() loads inactive methods too, hold them here
  // so the shared storefront cache stays active-only. null => use the cache.
  const [adminMethods, setAdminMethods] = useState<PaymentMethod[] | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const isAdminMode = adminMethods !== null;
  const paymentMethods = adminMethods ?? shared.data;
  const loading = isAdminMode ? adminLoading : shared.loading;
  const error = isAdminMode ? adminError : shared.error;

  const setPaymentMethods = setAdminMethods;
  const setLoading = setAdminLoading;
  const setError = setAdminError;

  const fetchPaymentMethods = () => activeMethodsResource.refresh();

  const fetchAllPaymentMethods = async () => {
    try {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setPaymentMethods(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching all payment methods:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment methods');
    } finally {
      setLoading(false);
    }
  };

  const addPaymentMethod = async (method: Omit<PaymentMethod, 'created_at' | 'updated_at'>) => {
    try {
      // Normalize qr_code_url: undefined/null/empty string → placeholder URL
      // Database requires NOT NULL, so we use a placeholder if empty
      let qrCodeUrl = method.qr_code_url?.trim() || '';
      if (!qrCodeUrl || qrCodeUrl === '') {
        // Use a placeholder image URL if no QR code is provided
        qrCodeUrl = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
      }
      
      console.log('📤 Adding payment method:', { 
        id: method.id, 
        name: method.name,
        qr_code_url: qrCodeUrl,
        qr_code_url_length: qrCodeUrl.length,
        is_placeholder: qrCodeUrl.includes('pexels.com')
      });
      
      const { data, error: insertError } = await supabase
        .from('payment_methods')
        .insert({
          id: method.id,
          name: method.name,
          account_number: method.account_number,
          account_name: method.account_name,
          qr_code_url: qrCodeUrl, // Always explicitly set (never empty)
          active: method.active,
          sort_order: method.sort_order
        })
        .select('*, qr_code_url') // Explicitly include qr_code_url in response
        .single();

      if (insertError) {
        console.error('❌ Supabase insert error:', insertError);
        console.error('❌ Error code:', insertError.code);
        console.error('❌ Error message:', insertError.message);
        console.error('❌ Error details:', JSON.stringify(insertError, null, 2));
        
        // Provide more helpful error message
        let errorMessage = insertError.message || 'Unknown error';
        if (insertError.code === '42501' || insertError.message?.includes('permission') || insertError.message?.includes('policy')) {
          errorMessage = 'Permission denied. Check Row Level Security (RLS) policies for the payment_methods table.';
        } else if (insertError.message?.includes('null value') || insertError.message?.includes('NOT NULL')) {
          errorMessage = 'Database error: Required field is missing. Please check all required fields are filled.';
        } else if (insertError.message?.includes('duplicate key') || insertError.message?.includes('unique constraint')) {
          errorMessage = `A payment method with ID "${method.id}" already exists. Please use a different ID.`;
        }
        
        throw new Error(errorMessage);
      }

      console.log('✅ Payment method added:', { 
        id: data?.id, 
        qr_code_url: data?.qr_code_url 
      });

      // Refresh the admin view and invalidate the storefront cache (active-status
      // or QR edits must reach GetAccess/Checkout).
      await Promise.all([fetchAllPaymentMethods(), activeMethodsResource.refresh()]);
      return data;
    } catch (err) {
      console.error('❌ Error adding payment method:', err);
      throw err;
    }
  };

  const updatePaymentMethod = async (id: string, updates: Partial<PaymentMethod>) => {
    try {
      // Create update payload
      const updatePayload: any = {};
      
      // Include all fields that are in the updates object
      if (updates.name !== undefined) updatePayload.name = updates.name;
      if (updates.account_number !== undefined) updatePayload.account_number = updates.account_number;
      if (updates.account_name !== undefined) updatePayload.account_name = updates.account_name;
      if (updates.active !== undefined) updatePayload.active = updates.active;
      if (updates.sort_order !== undefined) updatePayload.sort_order = updates.sort_order;
      
      // ALWAYS explicitly handle qr_code_url if it's in updates
      // Normalize: undefined/null/empty → placeholder URL (database requires NOT NULL)
      if ('qr_code_url' in updates) {
        if (updates.qr_code_url !== undefined && updates.qr_code_url !== null) {
          const urlString = String(updates.qr_code_url).trim();
          // Use placeholder if empty (database requires NOT NULL)
          updatePayload.qr_code_url = urlString === '' 
            ? 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop'
            : urlString;
        } else {
          // Use placeholder if null/undefined
          updatePayload.qr_code_url = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
        }
      }
      
      console.log('📤 Updating payment method:', { 
        id, 
        qr_code_url: updatePayload.qr_code_url,
        qr_code_url_type: typeof updatePayload.qr_code_url,
        qr_code_url_length: updatePayload.qr_code_url?.length || 0,
        has_qr_code_url: 'qr_code_url' in updatePayload,
        payload_keys: Object.keys(updatePayload),
        fullPayload: updatePayload 
      });
      
      const { data, error: updateError } = await supabase
        .from('payment_methods')
        .update(updatePayload)
        .eq('id', id)
        .select('*, qr_code_url') // Explicitly include qr_code_url in response
        .single();

      if (updateError) {
        console.error('❌ Supabase update error:', updateError);
        console.error('❌ Error code:', updateError.code);
        console.error('❌ Error message:', updateError.message);
        console.error('❌ Error details:', JSON.stringify(updateError, null, 2));
        
        // Provide more helpful error message
        let errorMessage = updateError.message || 'Unknown error';
        if (updateError.code === '42501' || updateError.message?.includes('permission') || updateError.message?.includes('policy')) {
          errorMessage = 'Permission denied. Check Row Level Security (RLS) policies for the payment_methods table.';
        } else if (updateError.message?.includes('null value') || updateError.message?.includes('NOT NULL')) {
          errorMessage = 'Database error: Required field is missing. Please check all required fields are filled.';
        }
        
        throw new Error(errorMessage);
      }

      console.log('✅ Payment method updated:', { 
        id, 
        qr_code_url: data?.qr_code_url,
        qr_code_url_type: typeof data?.qr_code_url,
        qr_code_url_length: data?.qr_code_url?.length || 0
      });
      
      // Verify the qr_code_url was actually saved
      if ('qr_code_url' in updatePayload && updatePayload.qr_code_url && data?.qr_code_url !== updatePayload.qr_code_url) {
        console.warn('⚠️ WARNING: qr_code_url mismatch!', {
          sent: updatePayload.qr_code_url,
          received: data?.qr_code_url
        });
      } else if ('qr_code_url' in updatePayload && updatePayload.qr_code_url && data?.qr_code_url === updatePayload.qr_code_url) {
        console.log('✅ QR code URL verified - matches what was sent');
      }

      // Refresh the admin view and invalidate the storefront cache (active-status
      // or QR edits must reach GetAccess/Checkout).
      await Promise.all([fetchAllPaymentMethods(), activeMethodsResource.refresh()]);
      return data;
    } catch (err) {
      console.error('❌ Error updating payment method:', err);
      throw err;
    }
  };

  const deletePaymentMethod = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Refresh the admin view and invalidate the storefront cache (active-status
      // or QR edits must reach GetAccess/Checkout).
      await Promise.all([fetchAllPaymentMethods(), activeMethodsResource.refresh()]);
    } catch (err) {
      console.error('Error deleting payment method:', err);
      throw err;
    }
  };

  const reorderPaymentMethods = async (reorderedMethods: PaymentMethod[]) => {
    try {
      const updates = reorderedMethods.map((method, index) => ({
        id: method.id,
        sort_order: index + 1
      }));

      for (const update of updates) {
        await supabase
          .from('payment_methods')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }

      // Refresh the admin view and invalidate the storefront cache (active-status
      // or QR edits must reach GetAccess/Checkout).
      await Promise.all([fetchAllPaymentMethods(), activeMethodsResource.refresh()]);
    } catch (err) {
      console.error('Error reordering payment methods:', err);
      throw err;
    }
  };

  return {
    paymentMethods,
    loading,
    error,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    reorderPaymentMethods,
    refetch: fetchPaymentMethods,
    refetchAll: fetchAllPaymentMethods
  };
};