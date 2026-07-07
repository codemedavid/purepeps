import { describe, it, expect } from 'vitest';
import { getActionErrorMessage } from './errorMessage';

describe('getActionErrorMessage', () => {
  it('returns the message of a real Error instance', () => {
    // Arrange
    const error = new Error('Something specific broke');

    // Act
    const message = getActionErrorMessage(error);

    // Assert
    expect(message).toBe('Something specific broke');
  });

  it('surfaces the message of a Supabase PostgrestError plain object', () => {
    // Arrange — Supabase errors are plain objects, NOT `instanceof Error`. This is
    // exactly the group-buy cap rejection raised by the enforce_group_buy_on_order
    // trigger, which was previously collapsed into a generic "Action failed".
    const postgrestError = {
      message:
        'Group buy limit reached for one of the items in your order (cap 50, already reserved 45, you requested 10).',
      details: null,
      hint: null,
      code: 'check_violation',
    };

    // Act
    const message = getActionErrorMessage(postgrestError);

    // Assert
    expect(message).toBe(
      'Group buy limit reached for one of the items in your order (cap 50, already reserved 45, you requested 10).',
    );
  });

  it('appends a distinct hint so the operator sees the actionable detail', () => {
    // Arrange
    const error = {
      message: 'Order rejected.',
      details: null,
      hint: 'Reduce the quantity and try again.',
      code: 'check_violation',
    };

    // Act
    const message = getActionErrorMessage(error);

    // Assert
    expect(message).toBe('Order rejected. Reduce the quantity and try again.');
  });

  it('does not duplicate text when details repeats the message', () => {
    // Arrange
    const error = { message: 'Cap reached.', details: 'Cap reached.', hint: null };

    // Act
    const message = getActionErrorMessage(error);

    // Assert
    expect(message).toBe('Cap reached.');
  });

  it('returns the string itself when the error is a non-empty string', () => {
    expect(getActionErrorMessage('Raw failure string')).toBe('Raw failure string');
  });

  it('falls back for null, undefined, and empty objects', () => {
    expect(getActionErrorMessage(null)).toBe('Action failed');
    expect(getActionErrorMessage(undefined)).toBe('Action failed');
    expect(getActionErrorMessage({})).toBe('Action failed');
  });

  it('falls back when an Error carries no message', () => {
    expect(getActionErrorMessage(new Error(''))).toBe('Action failed');
  });

  it('uses the caller-provided fallback', () => {
    expect(getActionErrorMessage(null, 'Could not save items')).toBe('Could not save items');
  });
});
