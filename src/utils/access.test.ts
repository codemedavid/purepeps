import { describe, it, expect } from 'vitest';
import { isValidEmail, resolvePendingStatus } from './access';

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
