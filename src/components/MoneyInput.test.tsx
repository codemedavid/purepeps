import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MoneyInput } from './MoneyInput';

/**
 * Controlled wrapper so tests exercise MoneyInput the way the app uses it:
 * the parent owns a numeric (or null) value and re-renders on change.
 */
function ControlledMoney({
  initial = null,
  allowEmpty = false,
  onValue,
}: {
  initial?: number | null;
  allowEmpty?: boolean;
  onValue?: (value: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <MoneyInput
      aria-label="price"
      value={value}
      allowEmpty={allowEmpty}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe('MoneyInput', () => {
  it('renders the initial numeric value as text', () => {
    render(<ControlledMoney initial={1500} />);

    expect(screen.getByLabelText('price')).toHaveValue('1500');
  });

  it('lets the user type a whole number without forcing a decimal point', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledMoney onValue={onValue} />);

    const input = screen.getByLabelText('price');
    await user.type(input, '1500');

    expect(input).toHaveValue('1500');
    expect(onValue).toHaveBeenLastCalledWith(1500);
  });

  it('keeps a trailing decimal point while typing instead of dropping it', async () => {
    const user = userEvent.setup();
    render(<ControlledMoney />);

    const input = screen.getByLabelText('price');
    await user.type(input, '12.');

    // The dot must survive so the user can continue typing the cents.
    expect(input).toHaveValue('12.');
  });

  it('parses a full decimal value', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledMoney onValue={onValue} />);

    await user.type(screen.getByLabelText('price'), '12.50');

    expect(onValue).toHaveBeenLastCalledWith(12.5);
  });

  it('emits null when cleared and allowEmpty is set', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledMoney initial={99} allowEmpty onValue={onValue} />);

    await user.clear(screen.getByLabelText('price'));

    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText('price')).toHaveValue('');
  });

  it('emits 0 when cleared and allowEmpty is not set', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledMoney initial={99} onValue={onValue} />);

    await user.clear(screen.getByLabelText('price'));

    expect(onValue).toHaveBeenLastCalledWith(0);
  });

  it('ignores non-numeric characters', async () => {
    const user = userEvent.setup();
    render(<ControlledMoney />);

    const input = screen.getByLabelText('price');
    await user.type(input, '1a2b');

    expect(input).toHaveValue('12');
  });

  it('syncs the displayed text when the external value changes', () => {
    const { rerender } = render(<MoneyInput aria-label="price" value={10} onChange={vi.fn()} />);
    expect(screen.getByLabelText('price')).toHaveValue('10');

    rerender(<MoneyInput aria-label="price" value={250} onChange={vi.fn()} />);
    expect(screen.getByLabelText('price')).toHaveValue('250');
  });
});
