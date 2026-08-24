import { describe, it, expect } from 'vitest';
import {
  LIGWAK_REFUND_STATUSES,
  LIGWAK_REFUND_STATUS_OPTIONS,
  ligwakRefundStatusLabel,
  ligwakRefundStatusColor,
  isLigwakRefundSettled,
} from './ligwak';

describe('ligwak refund status vocabulary', () => {
  it('carries exactly the six statuses the workflow defines', () => {
    expect([...LIGWAK_REFUND_STATUSES]).toEqual([
      'for_review',
      'refund_pending',
      'refund_processing',
      'refunded',
      'refund_failed',
      'no_refund_required',
    ]);
  });

  it('labels every status for the admin dashboard', () => {
    expect(ligwakRefundStatusLabel('for_review')).toBe('For Review');
    expect(ligwakRefundStatusLabel('refund_pending')).toBe('Refund Pending');
    expect(ligwakRefundStatusLabel('refund_processing')).toBe('Refund Processing');
    expect(ligwakRefundStatusLabel('refunded')).toBe('Refunded');
    expect(ligwakRefundStatusLabel('refund_failed')).toBe('Refund Failed');
    expect(ligwakRefundStatusLabel('no_refund_required')).toBe('No Refund Required');
  });

  it('passes an unknown token through instead of hiding it', () => {
    expect(ligwakRefundStatusLabel('something_new')).toBe('something_new');
    expect(ligwakRefundStatusLabel(null)).toBe('—');
  });

  it('gives every status a colour and falls back neutrally', () => {
    for (const status of LIGWAK_REFUND_STATUSES) {
      expect(ligwakRefundStatusColor(status)).toMatch(/bg-/);
    }
    expect(ligwakRefundStatusColor('unknown')).toMatch(/bg-/);
  });

  it('offers every status as an admin choice', () => {
    expect(LIGWAK_REFUND_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      ...LIGWAK_REFUND_STATUSES,
    ]);
  });

  it('treats only refunded and no-refund-required as settled', () => {
    expect(isLigwakRefundSettled('refunded')).toBe(true);
    expect(isLigwakRefundSettled('no_refund_required')).toBe(true);
    expect(isLigwakRefundSettled('for_review')).toBe(false);
    expect(isLigwakRefundSettled('refund_pending')).toBe(false);
    expect(isLigwakRefundSettled('refund_processing')).toBe(false);
    // A failed refund is emphatically NOT settled — money is still owed.
    expect(isLigwakRefundSettled('refund_failed')).toBe(false);
  });
});
