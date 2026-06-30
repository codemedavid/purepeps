import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderTracking from './OrderTracking';

// Mock posthog
const mockCapture = vi.fn();
vi.mock('../lib/posthog', () => ({
  default: { capture: (...args: unknown[]) => mockCapture(...args) },
}));

// Mock supabase RPC. OrderTracking now fetches the order bundle (root + claim
// add-ons) via the get_order_bundle RPC, which resolves to an array of rows.
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// The leftover-claim panel is exercised in its own test file; stub it here so
// OrderTracking tests stay focused on the bundle/timeline behavior.
vi.mock('./groupbuy/LeftoverClaimPanel', () => ({
  default: () => <div data-testid="leftover-claim-panel">Leftover panel</div>,
}));

// Image upload hits ImageKit; stub it to resolve a stable URL.
vi.mock('../hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    uploadImage: vi.fn(async () => 'https://cdn.example/balance.png'),
    uploading: false,
  }),
}));

const mockRoot = {
  id: 'order-uuid-123',
  order_number: 'TBS-1234',
  order_status: 'out_for_delivery',
  payment_status: 'paid',
  tracking_number: 'LBC123456',
  shipping_provider: 'lbc',
  shipping_note: 'Package is en route to your area',
  total_price: 5000,
  shipping_fee: 200,
  order_items: [
    { product_name: 'BPC-157 5mg', quantity: 2 },
    { product_name: 'GHK-Cu 10mg', quantity: 1 },
  ],
  created_at: '2025-01-15T10:00:00Z',
  promo_code: 'SAVE10',
  discount_applied: 500,
  fulfillment_stage: null,
  is_claim: false,
  parent_order_id: null,
  group_buy_batch_id: 'batch-uuid-1',
  batch_status: 'open',
};

/** Resolve the get_order_bundle RPC with the given rows for the next call. */
function mockBundleOnce(rows: unknown[], error: unknown = null) {
  mockRpc.mockResolvedValueOnce({ data: rows, error });
}

describe('OrderTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [mockRoot], error: null });
  });

  // --- Rendering ---

  describe('rendering', () => {
    it('renders the tracking page with heading and search form', () => {
      render(<OrderTracking />);

      expect(screen.getByText('Track Your Order')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter Order Number/)).toBeInTheDocument();
      expect(screen.getByText('Track Order')).toBeInTheDocument();
    });

    it('has disabled Track button when input is empty', () => {
      render(<OrderTracking />);
      const button = screen.getByText('Track Order').closest('button');
      expect(button).toBeDisabled();
    });

    it('enables Track button when input has value', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      const button = screen.getByText('Track Order').closest('button');
      expect(button).not.toBeDisabled();
    });

    it('has a Back to Shop link', () => {
      render(<OrderTracking />);
      const backLink = screen.getByText('Back to Shop').closest('a');
      expect(backLink).toHaveAttribute('href', '/');
    });
  });

  // --- Order Search ---

  describe('order search', () => {
    it('calls the bundle RPC with trimmed order ID', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), '  TBS-1234  ');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('get_order_bundle', { order_id_input: 'TBS-1234' });
      });
    });

    it('displays order number after successful search', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
    });

    it('displays the human-readable current stage', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        // Appears in both the header and the timeline step.
        expect(screen.getAllByText('Out for delivery').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('picks the non-claim row as the root for the timeline', async () => {
      const claim = {
        ...mockRoot,
        id: 'claim-uuid-1',
        order_number: 'TBS-9999',
        is_claim: true,
        parent_order_id: 'order-uuid-123',
        order_status: 'new',
      };
      // Claim row first to prove root selection ignores array order.
      mockBundleOnce([claim, mockRoot]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        // Root order number shown in the status header.
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
      // Root status (out_for_delivery), not the claim's "new".
      expect(screen.getAllByText('Out for delivery').length).toBeGreaterThanOrEqual(1);
    });

    it('shows loading state while searching', async () => {
      let resolveRpc!: (value: unknown) => void;
      mockRpc.mockReturnValueOnce(new Promise((r) => { resolveRpc = r; }));

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      expect(screen.getByText('Searching...')).toBeInTheDocument();

      resolveRpc({ data: [mockRoot], error: null });
      await waitFor(() => {
        expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
      });
    });

    it('tracks successful order lookup via posthog', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(mockCapture).toHaveBeenCalledWith('tbs_order_tracked', {
          order_number: 'TBS-1234',
          order_status: 'out_for_delivery',
        });
      });
    });
  });

  // --- Order Items Display ---

  describe('order items', () => {
    it('shows all order items with quantities', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/2x BPC-157 5mg/)).toBeInTheDocument();
      });
      expect(screen.getByText(/1x GHK-Cu 10mg/)).toBeInTheDocument();
    });

    it('shows total price (including shipping)', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        // total_price(5000) + shipping_fee(200) = 5,200
        expect(screen.getByText('₱5,200')).toBeInTheDocument();
      });
    });

    it('shows discount info when promo was applied', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/SAVE10/)).toBeInTheDocument();
        expect(screen.getByText(/-₱500/)).toBeInTheDocument();
      });
    });

    it('does not show discount section when no discount', async () => {
      mockBundleOnce([{ ...mockRoot, discount_applied: null, promo_code: null }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Discount/)).not.toBeInTheDocument();
    });
  });

  // --- Claim Add-ons ---

  describe('claim add-ons', () => {
    it('renders the add-ons section listing claim rows', async () => {
      const claim = {
        ...mockRoot,
        id: 'claim-uuid-1',
        order_number: 'TBS-9999',
        is_claim: true,
        parent_order_id: 'order-uuid-123',
        order_status: 'confirmed',
        total_price: 1200,
        shipping_fee: 0,
        order_items: [{ product_name: 'Retatrutide 10mg', quantity: 1 }],
      };
      mockBundleOnce([mockRoot, claim]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('Add-ons in this group buy')).toBeInTheDocument();
      });
      expect(screen.getByText('TBS-9999')).toBeInTheDocument();
      expect(screen.getByText(/1x Retatrutide 10mg/)).toBeInTheDocument();
      // Add-on total = total_price(1200) + shipping(0)
      expect(screen.getByText('₱1,200')).toBeInTheDocument();
    });

    it('does not render the add-ons section when there are no claim rows', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
      expect(screen.queryByText('Add-ons in this group buy')).not.toBeInTheDocument();
    });
  });

  // --- Linked repeat orders (same email, same batch) ---

  describe('linked repeat orders', () => {
    const repeatOrder = {
      ...mockRoot,
      id: 'order-uuid-456',
      order_number: 'TBS-5678',
      order_status: 'new',
      payment_status: 'pending',
      payment_method_name: 'Maya',
      is_claim: false,
      parent_order_id: 'order-uuid-123',
      created_at: '2025-01-16T10:00:00Z',
      total_price: 1500,
      shipping_fee: 200,
      order_items: [{ product_name: 'Semaglutide 5mg', quantity: 1 }],
    };

    it('numbers each linked order as Order 1 / Order 2', async () => {
      mockBundleOnce([
        { ...mockRoot, payment_method_name: 'GCash' },
        repeatOrder,
      ]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('Order 1')).toBeInTheDocument();
      });
      expect(screen.getByText('Order 2')).toBeInTheDocument();
      // The second order's number is shown so the customer can identify it.
      expect(screen.getByText('TBS-5678')).toBeInTheDocument();
    });

    it('shows each order its own payment method', async () => {
      mockBundleOnce([
        { ...mockRoot, payment_method_name: 'GCash' },
        repeatOrder,
      ]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/GCash/)).toBeInTheDocument();
      });
      expect(screen.getByText(/Maya/)).toBeInTheDocument();
    });

    it('does not render the numbered-orders section for a single order', async () => {
      mockBundleOnce([{ ...mockRoot, payment_method_name: 'GCash' }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
      expect(screen.queryByText('Order 2')).not.toBeInTheDocument();
    });
  });

  // --- Additional payment (balance after items added post-payment) ---

  describe('additional payment', () => {
    const balanceRoot = {
      ...mockRoot,
      payment_status: 'pending',
      paid_total: 1000,
      balance_due: 500,
    };

    it('prompts for the balance and submits a new receipt', async () => {
      mockBundleOnce([balanceRoot]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/Additional payment required/)).toBeInTheDocument();
      });
      expect(screen.getAllByText(/₱500/).length).toBeGreaterThanOrEqual(1);

      const input = screen.getByLabelText(/upload new receipt/i);
      const file = new File(['x'], 'receipt.png', { type: 'image/png' });
      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('submit_additional_payment', {
          order_id_input: 'TBS-1234',
          proof_url: 'https://cdn.example/balance.png',
        });
      });
    });

    it('shows the under-review message once a balance receipt is submitted', async () => {
      mockBundleOnce([{ ...balanceRoot, payment_status: 'submitted' }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/under review/i)).toBeInTheDocument();
      });
    });

    it('does not show the banner when nothing is owed', async () => {
      mockBundleOnce([{ ...mockRoot, balance_due: 0 }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Additional payment required/)).not.toBeInTheDocument();
    });
  });

  // --- Leftover Claim Panel ---

  describe('leftover claim panel', () => {
    it('mounts the claim panel when the batch is finalizing', async () => {
      mockBundleOnce([{ ...mockRoot, batch_status: 'finalizing' }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByTestId('leftover-claim-panel')).toBeInTheDocument();
      });
    });

    it('does not mount the claim panel when the batch is not finalizing', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('TBS-1234')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('leftover-claim-panel')).not.toBeInTheDocument();
    });
  });

  // --- Status Progress Steps ---

  describe('status progress', () => {
    it('shows the full nine-stage timeline for a non-cancelled order', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('Placed')).toBeInTheDocument();
      });
      const labels = [
        'Placed',
        'Confirmed',
        'Supplier preparing',
        'In logistics',
        'On the way to PH',
        'Arrived in PH',
        'Packing',
        'Out for delivery',
        'Delivered',
      ];
      for (const label of labels) {
        expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('advances the timeline using the batch fulfillment stage', async () => {
      // Order itself is only confirmed, but its batch is en route to PH — the
      // shared batch leg must drive the displayed stage.
      mockBundleOnce([{ ...mockRoot, order_status: 'confirmed', fulfillment_stage: 'enroute_ph' }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getAllByText('On the way to PH').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows cancelled message for cancelled orders', async () => {
      mockBundleOnce([{ ...mockRoot, order_status: 'cancelled' }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('Order Cancelled')).toBeInTheDocument();
        expect(screen.getByText(/This order has been cancelled/)).toBeInTheDocument();
      });

      // Progress steps should NOT be present
      expect(screen.queryByText('Placed')).not.toBeInTheDocument();
    });
  });

  // --- Tracking Information ---

  describe('tracking information', () => {
    it('shows tracking number when available', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('LBC123456')).toBeInTheDocument();
      });
    });

    it('shows "no tracking" message when tracking number absent', async () => {
      mockBundleOnce([{ ...mockRoot, tracking_number: null, shipping_provider: null }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('No tracking number available yet.')).toBeInTheDocument();
      });
    });

    it('shows shipping note when present', async () => {
      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText('Package is en route to your area')).toBeInTheDocument();
      });
    });
  });

  // --- Shipping Providers ---

  describe('shipping provider links', () => {
    const providerTests = [
      { provider: 'lbc', buttonText: 'Track on LBC Express' },
      { provider: 'lalamove', buttonText: 'Open Lalamove App/Web' },
      { provider: 'maxim', buttonText: 'Open Maxim App/Web' },
      { provider: 'spx', buttonText: 'Track on SPX Express' },
    ];

    it.each(providerTests)('shows "$buttonText" for provider "$provider"', async ({ provider, buttonText }) => {
      mockBundleOnce([{ ...mockRoot, shipping_provider: provider }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        const link = screen.getByText(buttonText);
        expect(link).toBeInTheDocument();
        expect(link.closest('a')).toHaveAttribute('target', '_blank');
      });
    });

    it('shows J&T Express link for default provider', async () => {
      mockBundleOnce([{ ...mockRoot, shipping_provider: 'jt' }]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        // Use getAllByText since J&T Express appears in both label and link
        const elements = screen.getAllByText(/J.T Express/);
        expect(elements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // --- Error States ---

  describe('error states', () => {
    it('shows "order not found" for an empty bundle', async () => {
      mockBundleOnce([]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'INVALID');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/Order not found/)).toBeInTheDocument();
      });
    });

    it('shows "order not found" when data is null', async () => {
      mockBundleOnce(null as unknown as unknown[]);

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'EMPTY');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/Order not found/)).toBeInTheDocument();
      });
    });

    it('shows generic error on unexpected exception', async () => {
      mockRpc.mockRejectedValueOnce(new Error('Network failure'));

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/An error occurred while fetching your order/)).toBeInTheDocument();
      });
    });

    it('shows generic error when the RPC returns an error', async () => {
      mockBundleOnce([], { code: 'UNEXPECTED', message: 'DB crash' });

      render(<OrderTracking />);

      await userEvent.type(screen.getByPlaceholderText(/Enter Order Number/), 'TBS-1234');
      await userEvent.click(screen.getByText('Track Order'));

      await waitFor(() => {
        expect(screen.getByText(/An error occurred/)).toBeInTheDocument();
      });
    });
  });
});
