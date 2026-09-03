import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ProductMinimumOrderFields, {
  type ProductMinimumOrderValue,
} from './ProductMinimumOrderFields';

const UNIVERSAL = { enabled: true, quantity: 5, unit: 'vial' as const };

function value(overrides: Partial<ProductMinimumOrderValue> = {}): ProductMinimumOrderValue {
  return {
    minimum_order_enabled: true,
    use_universal_minimum: true,
    minimum_order_quantity: 2,
    minimum_order_unit: null,
    minimum_order_message: null,
    enforce_minimum_per_variation: false,
    ...overrides,
  };
}

const onChange = vi.fn();

/**
 * Drives the component the way the product form does: it is CONTROLLED, so a
 * harness that never feeds the new value back makes every keystroke append to
 * a stale one ("2" + "8" = 28 rather than 8).
 */
function Harness({ initial }: { initial: ProductMinimumOrderValue }) {
  const [current, setCurrent] = useState(initial);
  return (
    <ProductMinimumOrderFields
      value={current}
      universal={UNIVERSAL}
      onChange={(next) => {
        setCurrent(next);
        onChange(next);
      }}
    />
  );
}

function renderFields(overrides: Partial<ProductMinimumOrderValue> = {}) {
  render(<Harness initial={value(overrides)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductMinimumOrderFields — following the universal setting', () => {
  it('shows what the product will actually require, not a blank field', () => {
    // An admin looking at a product that follows the universal setting needs to
    // see the number it resolves to. "Use universal" alone says nothing about
    // what customers will be told.
    renderFields();

    expect(screen.getByText(/5 vials/i)).toBeInTheDocument();
  });

  it('hides the custom quantity while the product follows the universal setting', () => {
    renderFields();

    expect(screen.queryByLabelText(/custom minimum/i)).not.toBeInTheDocument();
  });

  it('reveals the custom quantity and unit once the product overrides', () => {
    renderFields({ use_universal_minimum: false });

    expect(screen.getByLabelText(/custom minimum/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unit/i)).toBeInTheDocument();
  });

  it('switches the product to its own minimum', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(screen.getByRole('switch', { name: /use universal minimum/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ use_universal_minimum: false }),
    );
  });
});

describe('ProductMinimumOrderFields — switching enforcement off', () => {
  it('says plainly that this product will have no minimum', () => {
    renderFields({ minimum_order_enabled: false });

    expect(screen.getByText(/no minimum/i)).toBeInTheDocument();
  });

  it('hides the rest of the controls, which no longer do anything', () => {
    // Leaving an editable quantity beside a disabled rule invites an admin to
    // set a number and expect it to apply.
    renderFields({ minimum_order_enabled: false, use_universal_minimum: false });

    expect(screen.queryByLabelText(/custom minimum/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /use universal minimum/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the stored quantity so switching back restores it', async () => {
    const user = userEvent.setup();
    renderFields({ use_universal_minimum: false, minimum_order_quantity: 12 });

    await user.click(screen.getByRole('switch', { name: /require a minimum/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minimum_order_enabled: false, minimum_order_quantity: 12 }),
    );
  });
});

describe('ProductMinimumOrderFields — the other controls', () => {
  it('edits the custom quantity', async () => {
    const user = userEvent.setup();
    renderFields({ use_universal_minimum: false });

    await user.clear(screen.getByLabelText(/custom minimum/i));
    await user.type(screen.getByLabelText(/custom minimum/i), '8');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ minimum_order_quantity: 8 }),
    );
  });

  it('offers the four units', () => {
    renderFields({ use_universal_minimum: false });

    for (const unit of ['vial', 'piece', 'box', 'kit']) {
      expect(screen.getByRole('option', { name: new RegExp(unit, 'i') })).toBeInTheDocument();
    }
  });

  it('accepts a customer-facing message', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.type(screen.getByLabelText(/message/i), 'Packs of five.');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ minimum_order_message: 'Packs of five.' }),
    );
  });

  it('offers per-variation enforcement and explains what it changes', async () => {
    const user = userEvent.setup();
    renderFields();

    // The default combines variations, which is the surprising half — an admin
    // needs to know that is what "off" means before they leave it off.
    expect(screen.getByText(/combined|added together/i)).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /each variation/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enforce_minimum_per_variation: true }),
    );
  });
});
