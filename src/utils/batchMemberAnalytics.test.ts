import { describe, it, expect } from 'vitest';
import { uniqueMembersByEmail, topBuyersByEmail } from './batchMemberAnalytics';
import type { AccessRequest, AccessStatus } from './access';
import type { BatchOrder } from '../types';

function member(
  id: string,
  email: string,
  status: AccessStatus,
  createdAt: string,
  tierName: string,
  amount = 300,
): AccessRequest {
  return {
    id,
    email,
    payment_method_id: null,
    payment_method_name: 'GCash',
    payment_proof_url: null,
    amount,
    status,
    notes: null,
    group_buy_batch_id: 'batch-1',
    tier_id: 'tier-1',
    tier_name: tierName,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function order(
  id: string,
  email: string,
  name: string,
  totalPrice: number | null,
  orderStatus = 'confirmed',
): BatchOrder {
  return {
    id,
    order_number: id,
    customer_name: name,
    customer_email: email,
    customer_phone: '',
    contact_method: null,
    selected_sticker_id: null,
    selected_sticker_name: null,
    shipping_address: null,
    shipping_barangay: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip_code: null,
    shipping_country: null,
    shipping_location: null,
    order_items: [],
    subtotal: null,
    total_price: totalPrice,
    shipping_fee: null,
    paid_total: null,
    payment_method_name: null,
    payment_proof_url: null,
    additional_payment_proof_url: null,
    payment_status: 'paid',
    order_status: orderStatus,
    admin_notes: null,
    notes: null,
    tracking_number: null,
    shipping_provider: null,
    shipping_note: null,
    group_buy_batch_id: 'batch-1',
    parent_order_id: null,
    is_claim: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  };
}

describe('uniqueMembersByEmail', () => {
  it('returns one row per email, unchanged when already unique', () => {
    const members = [
      member('m1', 'alice@example.com', 'approved', '2026-07-01T00:00:00Z', '300 Access'),
      member('m2', 'bob@example.com', 'pending', '2026-07-01T00:00:00Z', '200 Access'),
    ];
    expect(uniqueMembersByEmail(members)).toHaveLength(2);
  });

  it('collapses duplicate emails into a single member', () => {
    const members = [
      member('m1', 'alice@example.com', 'pending', '2026-07-01T00:00:00Z', '200 Access'),
      member('m2', 'alice@example.com', 'pending', '2026-07-02T00:00:00Z', '300 Access'),
    ];
    const unique = uniqueMembersByEmail(members);
    expect(unique).toHaveLength(1);
    expect(unique[0].email).toBe('alice@example.com');
  });

  it('treats emails case-insensitively', () => {
    const members = [
      member('m1', 'Alice@Example.com', 'pending', '2026-07-01T00:00:00Z', '200 Access'),
      member('m2', 'alice@example.com', 'pending', '2026-07-02T00:00:00Z', '300 Access'),
    ];
    expect(uniqueMembersByEmail(members)).toHaveLength(1);
  });

  it('prefers the approved (unlocked) request when an email has both', () => {
    const members = [
      member('m1', 'alice@example.com', 'pending', '2026-07-03T00:00:00Z', 'Pending tier'),
      member('m2', 'alice@example.com', 'approved', '2026-07-01T00:00:00Z', 'Approved tier'),
    ];
    const [row] = uniqueMembersByEmail(members);
    expect(row.status).toBe('approved');
    expect(row.tier_name).toBe('Approved tier');
  });

  it('uses the latest request when none are approved', () => {
    const members = [
      member('m1', 'alice@example.com', 'pending', '2026-07-01T00:00:00Z', 'Old tier'),
      member('m2', 'alice@example.com', 'pending', '2026-07-05T00:00:00Z', 'New tier'),
    ];
    const [row] = uniqueMembersByEmail(members);
    expect(row.tier_name).toBe('New tier');
  });

  it('uses the latest approved request when several are approved', () => {
    const members = [
      member('m1', 'alice@example.com', 'approved', '2026-07-01T00:00:00Z', 'Old tier'),
      member('m2', 'alice@example.com', 'approved', '2026-07-05T00:00:00Z', 'New tier'),
    ];
    const [row] = uniqueMembersByEmail(members);
    expect(row.tier_name).toBe('New tier');
  });

  it('returns an empty array for no members', () => {
    expect(uniqueMembersByEmail([])).toEqual([]);
  });
});

describe('topBuyersByEmail', () => {
  it('ranks buyers by total product spend, highest first', () => {
    const orders = [
      order('o1', 'alice@example.com', 'Alice', 1000),
      order('o2', 'bob@example.com', 'Bob', 2500),
      order('o3', 'carol@example.com', 'Carol', 500),
    ];
    const top = topBuyersByEmail(orders);
    expect(top.map((b) => b.email)).toEqual([
      'bob@example.com',
      'alice@example.com',
      'carol@example.com',
    ]);
    expect(top[0].totalSpend).toBe(2500);
  });

  it('sums multiple orders from the same email', () => {
    const orders = [
      order('o1', 'alice@example.com', 'Alice', 1000),
      order('o2', 'alice@example.com', 'Alice', 1500),
    ];
    const top = topBuyersByEmail(orders);
    expect(top).toHaveLength(1);
    expect(top[0].totalSpend).toBe(2500);
    expect(top[0].orderCount).toBe(2);
  });

  it('groups case-insensitively by email', () => {
    const orders = [
      order('o1', 'Alice@Example.com', 'Alice', 1000),
      order('o2', 'alice@example.com', 'Alice', 500),
    ];
    const top = topBuyersByEmail(orders);
    expect(top).toHaveLength(1);
    expect(top[0].totalSpend).toBe(1500);
  });

  it('excludes cancelled orders from the totals', () => {
    const orders = [
      order('o1', 'alice@example.com', 'Alice', 1000, 'cancelled'),
      order('o2', 'alice@example.com', 'Alice', 500, 'confirmed'),
    ];
    const top = topBuyersByEmail(orders);
    expect(top[0].totalSpend).toBe(500);
    expect(top[0].orderCount).toBe(1);
  });

  it('limits the leaderboard to the requested size', () => {
    const orders = [
      order('o1', 'a@example.com', 'A', 100),
      order('o2', 'b@example.com', 'B', 200),
      order('o3', 'c@example.com', 'C', 300),
    ];
    expect(topBuyersByEmail(orders, 2)).toHaveLength(2);
  });

  it('treats a null total_price as zero', () => {
    const orders = [order('o1', 'alice@example.com', 'Alice', null)];
    expect(topBuyersByEmail(orders)[0].totalSpend).toBe(0);
  });

  it('returns an empty array for no orders', () => {
    expect(topBuyersByEmail([])).toEqual([]);
  });
});
