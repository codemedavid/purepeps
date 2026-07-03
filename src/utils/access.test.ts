import { describe, it, expect } from 'vitest';
import { isValidEmail, resolvePendingStatus, findTierAmountMismatch } from './access';

describe('findTierAmountMismatch', () => {
  const tiers = [
    { id: 'tier-200', name: '200 Access', price: 200 },
    { id: 'tier-300', name: '300 Access', price: 300 },
  ];

  it('flags a request whose paid amount exceeds the granted tier price', () => {
    // The real bug: paid ₱300 but was tagged to the ₱200 tier.
    const result = findTierAmountMismatch(
      { amount: 300, tier_id: 'tier-200' },
      tiers,
    );
    expect(result).toEqual({ paid: 300, tierPrice: 200, tierName: '200 Access' });
  });

  it('flags a request whose paid amount is below the granted tier price', () => {
    const result = findTierAmountMismatch({ amount: 200, tier_id: 'tier-300' }, tiers);
    expect(result).toEqual({ paid: 200, tierPrice: 300, tierName: '300 Access' });
  });

  it('returns null when the amount matches the tier price', () => {
    expect(findTierAmountMismatch({ amount: 300, tier_id: 'tier-300' }, tiers)).toBeNull();
  });

  it('returns null when the request has no tier assigned', () => {
    expect(findTierAmountMismatch({ amount: 300, tier_id: null }, tiers)).toBeNull();
  });

  it('returns null when the tier is unknown to the catalog', () => {
    expect(findTierAmountMismatch({ amount: 300, tier_id: 'tier-999' }, tiers)).toBeNull();
  });

  it('coerces string amounts before comparing', () => {
    expect(
      findTierAmountMismatch({ amount: '300' as unknown as number, tier_id: 'tier-300' }, tiers),
    ).toBeNull();
  });
});

describe('resolvePendingStatus', () => {
  it('promotes a pending email once it is approved', () => {
    expect(resolvePendingStatus('approved')).toBe('promote');
  });

  it('keeps watching while still awaiting admin review', () => {
    expect(resolvePendingStatus('pending')).toBe('keep');
  });

  it('hands off to the renewal prompt when only approved on a prior batch', () => {
    expect(resolvePendingStatus('renew')).toBe('renew');
  });

  it('clears a pending email that was rejected or never approved', () => {
    expect(resolvePendingStatus('none')).toBe('clear');
  });
});

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('member@lab.org')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidEmail('  member@lab.org  ')).toBe(true);
  });

  it('rejects an address without a domain', () => {
    expect(isValidEmail('member@')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});
