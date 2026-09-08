import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ReviewForm from './ReviewForm';
import type { ReviewableProduct } from '../../hooks/useReviewSubmission';

const mockUseReviewSubmission = vi.fn();

vi.mock('../../hooks/useReviewSubmission', () => ({
  useReviewSubmission: () => mockUseReviewSubmission(),
  default: () => mockUseReviewSubmission(),
}));

const mockSavedOrders = vi.fn();
const mockSavedInfo = vi.fn();

vi.mock('../../hooks/useOrderHistory', () => ({
  useOrderHistory: () => ({ orders: mockSavedOrders(), addOrder: vi.fn(), clearOrders: vi.fn() }),
}));

vi.mock('../../hooks/useCheckoutInfo', () => ({
  useCheckoutInfo: () => ({ savedInfo: mockSavedInfo(), saveInfo: vi.fn(), clearInfo: vi.fn() }),
}));

vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    uploadImage: vi.fn().mockResolvedValue('https://img.example/uploaded.jpg'),
    uploading: false,
  }),
}));

const lookup = vi.fn().mockResolvedValue(undefined);
const submit = vi.fn().mockResolvedValue(undefined);
const reset = vi.fn();

function product(overrides: Partial<ReviewableProduct> = {}): ReviewableProduct {
  return {
    product_id: 'prod-1',
    product_name: 'BPC-157',
    variation_name: '10mg',
    already_reviewed: false,
    ...overrides,
  };
}

function withState(extra: Record<string, unknown> = {}) {
  mockUseReviewSubmission.mockReturnValue({
    products: [],
    verified: false,
    submitted: false,
    looking: false,
    submitting: false,
    loadingSettings: false,
    mediaEnabled: true,
    error: null,
    fieldErrors: {},
    lookup,
    submit,
    reset,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  lookup.mockResolvedValue(undefined);
  submit.mockResolvedValue(undefined);
  mockSavedOrders.mockReturnValue([]);
  mockSavedInfo.mockReturnValue(null);
});

describe('ReviewForm — step 1, proving the order', () => {
  it('asks only for the order number and email up front', () => {
    withState();

    render(<ReviewForm />);

    expect(screen.getByLabelText(/order number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    // The rating is step two; showing it now implies the review can be written
    // before the purchase is proven.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('sends what the customer typed to the lookup', async () => {
    const user = userEvent.setup();
    withState();

    render(<ReviewForm />);
    await user.type(screen.getByLabelText(/order number/i), 'PP-1042');
    await user.type(screen.getByLabelText(/email/i), 'maria@example.com');
    await user.click(screen.getByRole('button', { name: /find my order/i }));

    expect(lookup).toHaveBeenCalledWith('PP-1042', 'maria@example.com');
  });

  it('shows the verification failure without inventing a reason', () => {
    withState({ error: 'We could not find a delivered order with those details.' });

    render(<ReviewForm />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not find a delivered order/i);
  });

  it('disables the lookup while it is running', () => {
    withState({ looking: true });

    render(<ReviewForm />);

    expect(screen.getByRole('button', { name: /finding|find my order/i })).toBeDisabled();
  });
});

describe('ReviewForm — step 2, writing the review', () => {
  const verifiedState = {
    verified: true,
    products: [product(), product({ product_id: 'prod-2', product_name: 'TB-500' })],
  };

  it('offers the products from the proven order', () => {
    withState(verifiedState);

    render(<ReviewForm />);

    expect(screen.getByRole('option', { name: /BPC-157/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /TB-500/ })).toBeInTheDocument();
  });

  it('blocks a product this order already reviewed', () => {
    // The database enforces one review per (order, product); letting the
    // customer write a second one only to have it rejected wastes their time.
    withState({
      verified: true,
      products: [product({ already_reviewed: true })],
    });

    render(<ReviewForm />);

    expect(screen.getByRole('option', { name: /already reviewed/i })).toBeDisabled();
  });

  it('collects a rating, a display name and the review body', () => {
    withState(verifiedState);

    render(<ReviewForm />);

    expect(screen.getByRole('radiogroup', { name: /rating/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your review/i)).toBeInTheDocument();
  });

  it('promises anonymity next to the display name field', () => {
    // This is the field the client specifically asked to make safe. A reviewer
    // deciding what to type here needs to know their real name stays private.
    withState(verifiedState);

    render(<ReviewForm />);

    expect(screen.getByText(/never shown|not shown|stays private/i)).toBeInTheDocument();
  });

  it('submits what the customer entered', async () => {
    const user = userEvent.setup();
    withState(verifiedState);

    render(<ReviewForm />);
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByLabelText(/display name/i), 'Sakura22');
    await user.type(screen.getByLabelText(/your review/i), 'Arrived sealed and well packed.');
    await user.click(screen.getByRole('button', { name: /submit review/i }));

    expect(submit).toHaveBeenCalledWith({
      productId: 'prod-1',
      rating: 5,
      body: 'Arrived sealed and well packed.',
      displayName: 'Sakura22',
      photoUrls: [],
    });
  });

  it('marks every invalid field at once', () => {
    withState({
      ...verifiedState,
      fieldErrors: { rating: 'Choose a star rating.', body: 'Too short.' },
    });

    render(<ReviewForm />);

    expect(screen.getByText('Choose a star rating.')).toBeInTheDocument();
    expect(screen.getByText('Too short.')).toBeInTheDocument();
  });

  it('hides the photo control when the admin switched photos off', () => {
    withState({ ...verifiedState, mediaEnabled: false });

    render(<ReviewForm />);

    expect(screen.queryByLabelText(/photo/i)).not.toBeInTheDocument();
  });

  it('offers the photo control when photos are allowed', () => {
    withState(verifiedState);

    render(<ReviewForm />);

    expect(screen.getByLabelText(/photo/i)).toBeInTheDocument();
  });

  it('disables submit while the review is in flight', () => {
    withState({ ...verifiedState, submitting: true });

    render(<ReviewForm />);

    expect(screen.getByRole('button', { name: /submitting|submit review/i })).toBeDisabled();
  });
});

describe('ReviewForm — after submitting', () => {
  it('says the review is awaiting approval rather than implying it is live', () => {
    // Every review is born pending. "Thanks, your review is up!" would be a
    // lie, and the customer would go looking for it.
    withState({ verified: true, products: [product()], submitted: true });

    render(<ReviewForm />);

    expect(screen.getByText(/approval|reviewed by our team|before it appears/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument();
  });

  it('offers to write another review for the same order', async () => {
    const user = userEvent.setup();
    withState({ verified: true, products: [product()], submitted: true });

    render(<ReviewForm />);
    await user.click(screen.getByRole('button', { name: /write another/i }));

    expect(reset).toHaveBeenCalled();
  });
});

/**
 * The site already knows both values. "YOUR RECENT ORDERS" lists the order
 * number, and checkout saved the email the order was placed under. Making the
 * customer retype them — in exactly the spelling the order carries — is the
 * step the client got stuck on.
 */
describe('ReviewForm — reusing the identity this device already has', () => {
  it('prefills the order number from the most recent saved order', () => {
    mockSavedOrders.mockReturnValue([
      { orderNumber: 'TBS-100740-4243', total: 0, itemSummary: '', placedAt: '' },
    ]);
    withState();

    render(<ReviewForm />);

    expect(screen.getByLabelText(/order number/i)).toHaveValue('TBS-100740-4243');
  });

  it('prefills the email saved at checkout', () => {
    mockSavedInfo.mockReturnValue({ email: 'AdminPretty@Gmail.com' });
    withState();

    render(<ReviewForm />);

    expect(screen.getByLabelText(/email address/i)).toHaveValue('adminpretty@gmail.com');
  });

  it('leaves both fields empty on a device with no history', () => {
    withState();

    render(<ReviewForm />);

    expect(screen.getByLabelText(/order number/i)).toHaveValue('');
    expect(screen.getByLabelText(/email address/i)).toHaveValue('');
  });

  it('lets the customer overwrite what was prefilled', async () => {
    mockSavedOrders.mockReturnValue([
      { orderNumber: 'TBS-100740-4243', total: 0, itemSummary: '', placedAt: '' },
    ]);
    withState();

    render(<ReviewForm />);
    const field = screen.getByLabelText(/order number/i);
    await userEvent.clear(field);
    await userEvent.type(field, 'TBS-999');

    expect(field).toHaveValue('TBS-999');
  });

  it('shows the order status when a real order is not delivered yet', () => {
    withState({
      error: 'We found that order — it is currently "Packing".',
      orderStatus: 'packing',
    });

    render(<ReviewForm />);

    expect(screen.getByRole('alert')).toHaveTextContent(/packing/i);
  });
});
