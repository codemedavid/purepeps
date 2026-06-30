import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checkout from './Checkout';
import type { CartItem, Product, ProductVariation } from '../types';

// Mock posthog
vi.mock('../lib/posthog', () => ({
  default: { capture: vi.fn() },
}));

// Mock hooks
const mockPaymentMethods = [
  { id: 'pm-1', name: 'GCash', account_number: '09123456789', account_name: 'Joo Babe', qr_code_url: '', active: true, sort_order: 1, created_at: '', updated_at: '' },
];

const mockLocations = [
  { id: 'lbc_metro', name: 'Metro Manila (LBC)', fee: 150, active: true, sort_order: 1, created_at: '', updated_at: '' },
  { id: 'lbc_provincial', name: 'Provincial (LBC)', fee: 300, active: true, sort_order: 2, created_at: '', updated_at: '' },
];

const mockCouriers = [
  { id: 'cour-1', name: 'LBC Express', code: 'lbc', tracking_url_template: null, is_active: true, sort_order: 1, created_at: '' },
];

vi.mock('../hooks/usePaymentMethods', () => ({
  usePaymentMethods: () => ({ paymentMethods: mockPaymentMethods, loading: false }),
}));

vi.mock('../hooks/useShippingLocations', () => ({
  useShippingLocations: () => ({ locations: mockLocations, loading: false }),
}));

vi.mock('../hooks/useCouriers', () => ({
  useCouriers: () => ({ couriers: mockCouriers, loading: false }),
}));

vi.mock('../hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    uploadImage: vi.fn().mockResolvedValue('https://test.supabase.co/proof.png'),
    uploading: false,
    uploadProgress: 0,
  }),
}));

// Mock supabase - use lazy arrows to avoid hoisting
const mockPromoSingle = vi.fn();
const mockInsertSingle = vi.fn();
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: (...args: unknown[]) => mockPromoSingle(...args),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: (...args: unknown[]) => mockInsertSingle(...args),
        }),
      }),
      update: () => ({
        eq: (...args: unknown[]) => mockUpdateEq(...args),
      }),
    }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: 'proof.png' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://test.supabase.co/proof.png' } }),
      }),
    },
  },
}));

// Test fixtures
const mockProduct: Product = {
  id: 'prod-1',
  name: 'BPC-157',
  description: 'Recovery peptide',
  category: 'Recovery',
  base_price: 2500,
  discount_price: null,
  discount_start_date: null,
  discount_end_date: null,
  discount_active: false,
  purity_percentage: 99,
  molecular_weight: null,
  cas_number: null,
  sequence: null,
  storage_conditions: 'Refrigerate',
  inclusions: null,
  stock_quantity: 10,
  available: true,
  featured: false,
  image_url: null,
  safety_sheet_url: null,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
};

const mockVariation: ProductVariation = {
  id: 'var-1',
  product_id: 'prod-1',
  name: '5mg',
  quantity_mg: 5,
  price: 1500,
  disposable_pen_price: null,
  reusable_pen_price: null,
  discount_price: null,
  discount_active: false,
  stock_quantity: 5,
  created_at: '2025-01-01',
};

const cartItems: CartItem[] = [
  { product: mockProduct, variation: mockVariation, quantity: 2 },
];

const defaultProps = {
  cartItems,
  totalPrice: 3000, // 1500 * 2
  onBack: vi.fn(),
};

describe('Checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress window.scrollTo not implemented in jsdom
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mockPromoSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    mockInsertSingle.mockResolvedValue({
      data: { id: 'order-1', order_number: 'TBS-0001' },
      error: null,
    });
  });

  // --- Initial Rendering ---

  describe('rendering', () => {
    it('renders checkout with customer details fields', () => {
      render(<Checkout {...defaultProps} />);

      expect(screen.getByText('Checkout Information')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Juan Dela Cruz')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('juan@example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('09XX XXX XXXX')).toBeInTheDocument();
    });

    it('shows cart item in order summary', () => {
      render(<Checkout {...defaultProps} />);

      expect(screen.getByText(/BPC-157/)).toBeInTheDocument();
    });

    it('shows back to cart button', () => {
      render(<Checkout {...defaultProps} />);

      expect(screen.getByText('Back to Cart')).toBeInTheDocument();
    });

    it('calls onBack when back button is clicked', async () => {
      render(<Checkout {...defaultProps} />);

      await userEvent.click(screen.getByText('Back to Cart'));
      expect(defaultProps.onBack).toHaveBeenCalled();
    });
  });

  // --- Form Validation ---

  describe('form validation', () => {
    it('disables proceed button when required fields are empty', () => {
      render(<Checkout {...defaultProps} />);

      const proceedButton = screen.getByText('Proceed to Payment');
      expect(proceedButton.closest('button')).toBeDisabled();
    });

    it('shows address fields', () => {
      render(<Checkout {...defaultProps} />);

      expect(screen.getByPlaceholderText('House/Unit, Street Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Brgy. Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('City')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Province')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ZIP Code')).toBeInTheDocument();
    });
  });

  // --- Courier & Shipping ---

  describe('courier and shipping', () => {
    it('shows courier selection', () => {
      render(<Checkout {...defaultProps} />);

      expect(screen.getByText('LBC Express')).toBeInTheDocument();
    });

    it('shows shipping locations after selecting courier', async () => {
      render(<Checkout {...defaultProps} />);

      // Select courier first
      await userEvent.click(screen.getByText('LBC Express'));

      // Now shipping locations should appear (filtered by courier code 'lbc')
      await waitFor(() => {
        expect(screen.getByText(/Metro Manila/)).toBeInTheDocument();
        expect(screen.getByText(/Provincial/)).toBeInTheDocument();
      });
    });
  });

  // --- Promo Code ---

  describe('promo code', () => {
    it('shows promo code input field', () => {
      render(<Checkout {...defaultProps} />);

      expect(screen.getByPlaceholderText('ENTER CODE')).toBeInTheDocument();
    });

    it('shows error for invalid promo code', async () => {
      mockPromoSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'BADCODE');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        expect(screen.getByText(/Invalid or inactive promo code/i)).toBeInTheDocument();
      });
    });

    it('shows error for empty promo code', async () => {
      render(<Checkout {...defaultProps} />);

      // APPLY button should be disabled when input is empty
      const applyButton = screen.getByText('APPLY').closest('button');
      expect(applyButton).toBeDisabled();
    });

    it('applies valid percentage promo code', async () => {
      mockPromoSingle.mockResolvedValue({
        data: {
          id: 'promo-1',
          code: 'SAVE20',
          discount_type: 'percentage',
          discount_value: 20,
          min_purchase_amount: 0,
          max_discount_amount: null,
          start_date: null,
          end_date: null,
          usage_limit: null,
          usage_count: 0,
          active: true,
        },
        error: null,
      });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'SAVE20');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        // 20% of 3000 = 600 — check REMOVE button appears (confirms promo applied)
        expect(screen.getByText('REMOVE')).toBeInTheDocument();
      });
      expect(screen.getByText(/Promo code applied/)).toBeInTheDocument();
    });

    it('applies valid fixed discount promo code', async () => {
      mockPromoSingle.mockResolvedValue({
        data: {
          id: 'promo-2',
          code: 'FLAT500',
          discount_type: 'fixed',
          discount_value: 500,
          min_purchase_amount: 0,
          max_discount_amount: null,
          start_date: null,
          end_date: null,
          usage_limit: null,
          usage_count: 0,
          active: true,
        },
        error: null,
      });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'FLAT500');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        expect(screen.getByText('REMOVE')).toBeInTheDocument();
      });
      expect(screen.getByText(/Promo code applied/)).toBeInTheDocument();
    });

    it('shows error when minimum purchase not met', async () => {
      mockPromoSingle.mockResolvedValue({
        data: {
          id: 'promo-3',
          code: 'MINBUY',
          discount_type: 'percentage',
          discount_value: 10,
          min_purchase_amount: 10000,
          max_discount_amount: null,
          start_date: null,
          end_date: null,
          usage_limit: null,
          usage_count: 0,
          active: true,
        },
        error: null,
      });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'MINBUY');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        expect(screen.getByText(/Minimum purchase of ₱10000 required/)).toBeInTheDocument();
      });
    });

    it('shows error for expired promo code', async () => {
      mockPromoSingle.mockResolvedValue({
        data: {
          id: 'promo-4',
          code: 'EXPIRED',
          discount_type: 'percentage',
          discount_value: 10,
          min_purchase_amount: 0,
          max_discount_amount: null,
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          usage_limit: null,
          usage_count: 0,
          active: true,
        },
        error: null,
      });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'EXPIRED');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        expect(screen.getByText(/expired/i)).toBeInTheDocument();
      });
    });

    it('shows error for promo code with usage limit reached', async () => {
      mockPromoSingle.mockResolvedValue({
        data: {
          id: 'promo-5',
          code: 'USED',
          discount_type: 'percentage',
          discount_value: 10,
          min_purchase_amount: 0,
          max_discount_amount: null,
          start_date: null,
          end_date: null,
          usage_limit: 5,
          usage_count: 5,
          active: true,
        },
        error: null,
      });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'USED');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        expect(screen.getByText(/usage limit reached/i)).toBeInTheDocument();
      });
    });

    it('caps percentage discount at max_discount_amount', async () => {
      mockPromoSingle.mockResolvedValue({
        data: {
          id: 'promo-6',
          code: 'CAPPED',
          discount_type: 'percentage',
          discount_value: 50,
          min_purchase_amount: 0,
          max_discount_amount: 200,
          start_date: null,
          end_date: null,
          usage_limit: null,
          usage_count: 0,
          active: true,
        },
        error: null,
      });

      render(<Checkout {...defaultProps} />);

      await userEvent.type(screen.getByPlaceholderText('ENTER CODE'), 'CAPPED');
      await userEvent.click(screen.getByText('APPLY'));

      await waitFor(() => {
        expect(screen.getByText('REMOVE')).toBeInTheDocument();
      });
      expect(screen.getByText(/Promo code applied/)).toBeInTheDocument();
    });
  });

  // --- Access Tier Gate ---
  // Mirrors the server enforce_tier_on_order trigger so a member never reaches a
  // dead-end "Failed to save order" rejection at the final step. The gate must
  // (1) name the blocked items, (2) disable Proceed to Payment, and (3) judge
  // each item by its LIVE catalog category, not the cart's stored snapshot.

  describe('access tier gate', () => {
    it('blocks checkout and names items whose category is outside the member tier', () => {
      render(<Checkout {...defaultProps} canAccessCategory={() => false} />);

      expect(
        screen.getByText(/Some items are outside your access tier/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Proceed to Payment').closest('button'),
      ).toBeDisabled();
    });

    it('allows checkout when every cart category is within the member tier', () => {
      render(<Checkout {...defaultProps} canAccessCategory={() => true} />);

      expect(
        screen.queryByText(/outside your access tier/i),
      ).not.toBeInTheDocument();
    });

    it('gates on the LIVE catalog category, not the stale cart snapshot', () => {
      // The cart snapshot says 'Recovery' (which the member's tier allows), but
      // the catalog has since re-categorised the same product into the locked
      // 'Fat dissolvers' category. The gate must follow the live product, exactly
      // as the server does — otherwise the client passes an order the server then
      // rejects with a raw "access tier does not include ..." error.
      const liveProduct: Product = { ...mockProduct, category: 'Fat dissolvers' };

      render(
        <Checkout
          {...defaultProps}
          products={[liveProduct]}
          canAccessCategory={(categoryId) => categoryId !== 'Fat dissolvers'}
        />,
      );

      expect(
        screen.getByText(/Some items are outside your access tier/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Proceed to Payment').closest('button'),
      ).toBeDisabled();
    });

    it('does not gate any items when no tier restriction is supplied', () => {
      render(<Checkout {...defaultProps} />);

      expect(
        screen.queryByText(/outside your access tier/i),
      ).not.toBeInTheDocument();
    });
  });
});
