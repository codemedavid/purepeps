import { describe, it, expect } from 'vitest';
import { mapPrefillRowToCheckoutInfo, isCheckoutInfoComplete } from './checkoutPrefill';
import type { CheckoutPrefillRow } from './checkoutPrefill';

const completeRow: CheckoutPrefillRow = {
  customer_name: 'Maria Santos',
  customer_phone: '09171234567',
  contact_method: 'fb.com/maria',
  shipping_address: '123 Main St',
  shipping_barangay: 'Brgy Uno',
  shipping_city: 'Cebu City',
  shipping_state: 'Cebu',
  shipping_zip_code: '6000',
  courier_id: 'cour-1',
  shipping_location: 'lbc_provincial',
};

describe('mapPrefillRowToCheckoutInfo', () => {
  it('returns null when the row is null', () => {
    expect(mapPrefillRowToCheckoutInfo(null, 'maria@example.com')).toBeNull();
  });

  it('maps every server field onto the SavedCheckoutInfo shape', () => {
    const info = mapPrefillRowToCheckoutInfo(completeRow, 'maria@example.com');

    expect(info).toEqual({
      fullName: 'Maria Santos',
      email: 'maria@example.com',
      phone: '09171234567',
      contactMethod: 'fb.com/maria',
      address: '123 Main St',
      barangay: 'Brgy Uno',
      city: 'Cebu City',
      state: 'Cebu',
      zipCode: '6000',
      selectedCourierId: 'cour-1',
      shippingLocation: 'lbc_provincial',
    });
  });

  it('coalesces null server columns to empty strings and drops empty contactMethod', () => {
    const sparseRow: CheckoutPrefillRow = {
      ...completeRow,
      contact_method: null,
      courier_id: null,
    };

    const info = mapPrefillRowToCheckoutInfo(sparseRow, 'maria@example.com');

    expect(info?.contactMethod).toBeUndefined();
    expect(info?.selectedCourierId).toBe('');
  });

  it('uses the caller-supplied email, not any email on the row', () => {
    const info = mapPrefillRowToCheckoutInfo(completeRow, 'verified@member.com');
    expect(info?.email).toBe('verified@member.com');
  });
});

describe('isCheckoutInfoComplete', () => {
  it('returns false for null', () => {
    expect(isCheckoutInfoComplete(null)).toBe(false);
  });

  it('returns true when all required fields are present', () => {
    const info = mapPrefillRowToCheckoutInfo(completeRow, 'maria@example.com');
    expect(isCheckoutInfoComplete(info)).toBe(true);
  });

  it('returns true even when the optional contactMethod is missing', () => {
    const info = mapPrefillRowToCheckoutInfo(
      { ...completeRow, contact_method: null },
      'maria@example.com',
    );
    expect(isCheckoutInfoComplete(info)).toBe(true);
  });

  it.each([
    'fullName',
    'phone',
    'address',
    'barangay',
    'city',
    'state',
    'zipCode',
    'selectedCourierId',
    'shippingLocation',
  ] as const)('returns false when required field %s is empty', (field) => {
    const info = mapPrefillRowToCheckoutInfo(completeRow, 'maria@example.com');
    const incomplete = { ...info!, [field]: '' };
    expect(isCheckoutInfoComplete(incomplete)).toBe(false);
  });
});
