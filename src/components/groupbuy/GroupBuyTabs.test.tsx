import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupBuyTabs } from './GroupBuyTabs';

describe('GroupBuyTabs', () => {
  it('renders every tab inside a tablist', () => {
    render(<GroupBuyTabs active="overview" onChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(
      expect.arrayContaining(['Overview', 'Orders', 'Items & Caps', 'Shipping', 'History']),
    );
  });

  it('marks the active tab as selected', () => {
    render(<GroupBuyTabs active="orders" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /Orders/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the tab id when a tab is clicked', async () => {
    const onChange = vi.fn();
    render(<GroupBuyTabs active="overview" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /Shipping/ }));
    expect(onChange).toHaveBeenCalledWith('shipping');
  });

  it('shows a numeric badge for a tab when provided', () => {
    render(<GroupBuyTabs active="overview" onChange={vi.fn()} badges={{ orders: 42 }} />);
    expect(screen.getByRole('tab', { name: /Orders/ })).toHaveTextContent('42');
  });
});
