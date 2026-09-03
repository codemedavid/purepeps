import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import UniversalMinimumOrderPanel from './UniversalMinimumOrderPanel';

const mockUseUniversalMinimum = vi.fn();

vi.mock('../hooks/useUniversalMinimum', () => ({
  useUniversalMinimum: () => mockUseUniversalMinimum(),
  default: () => mockUseUniversalMinimum(),
}));

const save = vi.fn().mockResolvedValue(undefined);

function withSetting(extra: Record<string, unknown> = {}) {
  mockUseUniversalMinimum.mockReturnValue({
    universal: { enabled: false, quantity: 1, unit: 'vial' },
    loading: false,
    error: null,
    save,
    refetch: vi.fn(),
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
});

describe('UniversalMinimumOrderPanel', () => {
  it('names itself so an admin knows it governs every product', () => {
    withSetting();

    render(<UniversalMinimumOrderPanel />);

    expect(screen.getByRole('heading', { name: /universal minimum order/i })).toBeInTheDocument();
  });

  it('offers the switch, the quantity and the four units', () => {
    withSetting();

    render(<UniversalMinimumOrderPanel />);

    expect(screen.getByRole('switch', { name: /universal minimum/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum quantity/i)).toBeInTheDocument();
    for (const unit of ['vial', 'piece', 'box', 'kit']) {
      expect(screen.getByRole('option', { name: new RegExp(unit, 'i') })).toBeInTheDocument();
    }
  });

  it('shows the stored setting rather than a blank form', () => {
    withSetting({ universal: { enabled: true, quantity: 5, unit: 'box' } });

    render(<UniversalMinimumOrderPanel />);

    expect(screen.getByRole('switch', { name: /universal minimum/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText(/minimum quantity/i)).toHaveValue(5);
  });

  it('saves the whole setting together', async () => {
    const user = userEvent.setup();
    withSetting();

    render(<UniversalMinimumOrderPanel />);
    await user.click(screen.getByRole('switch', { name: /universal minimum/i }));
    await user.clear(screen.getByLabelText(/minimum quantity/i));
    await user.type(screen.getByLabelText(/minimum quantity/i), '5');
    await user.selectOptions(screen.getByLabelText(/unit/i), 'box');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(save).toHaveBeenCalledWith({ enabled: true, quantity: 5, unit: 'box' });
  });

  it('tells the admin plainly what turning it on will do', () => {
    // This one control changes every product at once. An admin should not have
    // to infer that from the label.
    withSetting();

    render(<UniversalMinimumOrderPanel />);

    expect(screen.getByText(/every product/i)).toBeInTheDocument();
  });

  it('says which products will ignore it', () => {
    // A product with its own override will not follow this, and an admin
    // wondering why a change "did nothing" needs that stated here.
    withSetting();

    render(<UniversalMinimumOrderPanel />);

    expect(screen.getByText(/own minimum|override/i)).toBeInTheDocument();
  });

  it('refuses to save a quantity below one', async () => {
    const user = userEvent.setup();
    withSetting();

    render(<UniversalMinimumOrderPanel />);
    await user.clear(screen.getByLabelText(/minimum quantity/i));
    await user.type(screen.getByLabelText(/minimum quantity/i), '0');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('surfaces a failed save instead of looking like it worked', async () => {
    const user = userEvent.setup();
    save.mockRejectedValue(new Error('denied'));
    withSetting();

    render(<UniversalMinimumOrderPanel />);
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/denied|could not/i);
  });

  it('confirms a save that landed', async () => {
    const user = userEvent.setup();
    withSetting();

    render(<UniversalMinimumOrderPanel />);
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
  });
});
