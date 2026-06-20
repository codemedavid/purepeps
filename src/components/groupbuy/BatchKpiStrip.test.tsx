import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatchKpiStrip } from './BatchKpiStrip';
import type { BatchKpis } from '../../utils/groupBuyOverview';

const kpis: BatchKpis = {
  totalOrders: 44,
  activeOrders: 42,
  cancelledOrders: 2,
  toConfirmCount: 8,
  paidOrders: 34,
  claimOrders: 3,
  grossRevenue: 150000,
  paidRevenue: 126000,
  totalUnits: 88,
};

describe('BatchKpiStrip', () => {
  it('shows the active order count', () => {
    render(<BatchKpiStrip kpis={kpis} />);
    expect(screen.getByRole('group', { name: /Orders: 42/ })).toBeInTheDocument();
  });

  it('shows paid revenue in compact peso form', () => {
    render(<BatchKpiStrip kpis={kpis} />);
    expect(screen.getByRole('group', { name: /Revenue: ₱126k/ })).toBeInTheDocument();
  });

  it('shows the awaiting-confirmation count', () => {
    render(<BatchKpiStrip kpis={kpis} />);
    expect(screen.getByRole('group', { name: /To confirm: 8/ })).toBeInTheDocument();
  });

  it('shows the paid order count', () => {
    render(<BatchKpiStrip kpis={kpis} />);
    expect(screen.getByRole('group', { name: /Paid: 34/ })).toBeInTheDocument();
  });
});
