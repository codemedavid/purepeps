import { useCallback, useState } from 'react';

const STORAGE_KEY = 'peptide_checkout_info';

export interface SavedCheckoutInfo {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  barangay: string;
  city: string;
  state: string;
  zipCode: string;
  selectedCourierId: string;
  shippingLocation: string;
  /** FB profile link or WhatsApp number the customer can be reached on. Optional. */
  contactMethod?: string;
}

function readSavedInfo(): SavedCheckoutInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedCheckoutInfo) : null;
  } catch (error) {
    console.error('Error loading saved checkout info:', error);
    return null;
  }
}

/**
 * Persists the customer's checkout details (contact + shipping address) to
 * localStorage so the form can be prefilled on their next order. This is
 * non-sensitive convenience data only — never tokens or payment info.
 */
export function useCheckoutInfo() {
  // Lazy initializer reads synchronously so the value is available on the very
  // first render, which lets the checkout form prefill its fields immediately.
  const [savedInfo, setSavedInfo] = useState<SavedCheckoutInfo | null>(readSavedInfo);

  const saveInfo = useCallback((info: SavedCheckoutInfo) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
      setSavedInfo(info);
    } catch (error) {
      console.error('Error saving checkout info:', error);
    }
  }, []);

  const clearInfo = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSavedInfo(null);
    } catch (error) {
      console.error('Error clearing saved checkout info:', error);
    }
  }, []);

  return { savedInfo, saveInfo, clearInfo };
}
