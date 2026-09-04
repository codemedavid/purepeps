import { describe, expect, it } from 'vitest';
import {
  readStorefrontRequest,
  storefrontNavigationOptions,
  type StorefrontRequest,
} from './storefrontNavigation';

describe('storefrontNavigationOptions', () => {
  it.each(['home', 'shop', 'cart'] as const)('carries the %s request as router state', (request) => {
    expect(storefrontNavigationOptions(request)).toEqual({ state: { storefront: request } });
  });
});

describe('readStorefrontRequest', () => {
  it.each(['home', 'shop', 'cart'] as const)('reads back the %s request', (request) => {
    expect(readStorefrontRequest({ storefront: request })).toBe(request);
  });

  it('round-trips every request through the options helper', () => {
    const requests: StorefrontRequest[] = ['home', 'shop', 'cart'];

    for (const request of requests) {
      expect(readStorefrontRequest(storefrontNavigationOptions(request).state)).toBe(request);
    }
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'cart'],
    ['a number', 7],
    ['an unrelated object', { from: '/coa' }],
    ['an unknown view name', { storefront: 'checkout' }],
    ['a non-string view', { storefront: 3 }],
  ])('discards %s', (_name, state) => {
    expect(readStorefrontRequest(state)).toBeNull();
  });
});
