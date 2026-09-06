import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';
import { DEFAULT_GB_LANDING } from '../utils/gbLanding';

// Every data hook is stubbed: this suite is about the admin being able to REACH
// the Site Settings screen from the dashboard, not about what Supabase returns.
//
// The real hooks hold these in useState, so their identity is stable across
// renders. Stubs must be stable too — a fresh literal per render makes every
// dependency array look changed and spins the effects forever (the symptom is a
// pinned CPU, not a failing test).
const NO_PRODUCTS: never[] = [];
const NO_CATEGORIES: never[] = [];
const NO_PROTOCOLS: never[] = [];
const NO_REQUESTS: never[] = [];

const noop = () => Promise.resolve();

const SITE_SETTINGS = {
  site_name: 'Pure Peps',
  site_description: 'Research peptides',
  site_logo: '',
  currency: '₱',
  currency_code: 'PHP',
};

vi.mock('../hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({
    session: { user: { id: 'admin-1' } },
    isAdmin: true,
    loading: false,
    error: null,
    signIn: noop,
    signOut: noop,
  }),
}));

vi.mock('../hooks/useMenu', () => ({
  useMenu: () => ({
    products: NO_PRODUCTS,
    loading: false,
    addProduct: noop,
    updateProduct: noop,
    deleteProduct: noop,
    refreshProducts: noop,
  }),
}));

vi.mock('../hooks/useCategories', () => ({
  useCategories: () => ({
    categories: NO_CATEGORIES,
    freeCategoryIds: NO_CATEGORIES,
    loading: false,
    error: null,
    addCategory: noop,
    updateCategory: noop,
    deleteCategory: noop,
    reorderCategories: noop,
    refetch: noop,
  }),
}));

vi.mock('../hooks/useProtocols', () => ({
  useProtocols: () => ({
    protocols: NO_PROTOCOLS,
    loading: false,
    error: null,
    addProtocol: noop,
    updateProtocol: noop,
    deleteProtocol: noop,
    toggleActive: noop,
  }),
}));

vi.mock('../hooks/useAccessRequests', () => ({
  useAccessRequests: () => ({
    requests: NO_REQUESTS,
    loading: false,
    error: null,
    fetchAll: noop,
  }),
}));

vi.mock('../hooks/useUniversalMinimum', () => ({
  useUniversalMinimum: () => ({
    universal: null,
    loading: false,
    error: null,
    save: noop,
    refetch: noop,
  }),
}));

vi.mock('../hooks/useSiteSettings', () => ({
  useSiteSettings: () => ({
    siteSettings: SITE_SETTINGS,
    loading: false,
    error: null,
    updateSiteSetting: noop,
    updateSiteSettings: noop,
    refetch: noop,
  }),
}));

vi.mock('../hooks/useGbLanding', () => ({
  useGbLanding: () => ({
    content: DEFAULT_GB_LANDING,
    loading: false,
    error: null,
    save: noop,
    refetch: noop,
  }),
}));

vi.mock('../hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    uploadImage: noop,
    uploading: false,
    uploadProgress: 0,
  }),
}));

// Siblings of GbLandingManager inside the settings screen. Not under test here.
vi.mock('./AccessIntakeToggle', () => ({ default: () => null }));
vi.mock('./StorefrontNoticeManager', () => ({ default: () => null }));

describe('AdminDashboard quick actions', () => {
  it('offers a Settings quick action', () => {
    render(<AdminDashboard />);

    expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
  });

  it('opens the Group Buy Landing editor from the Settings quick action', async () => {
    const user = userEvent.setup();

    render(<AdminDashboard />);
    await user.click(screen.getByRole('button', { name: /Settings/i }));

    // The timeline editor an admin needs in order to change the homepage stages.
    expect(screen.getByRole('heading', { name: /Group Buy Landing/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Stage 1 date/i)).toBeInTheDocument();
  });
});
