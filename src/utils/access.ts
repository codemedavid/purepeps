// Pure Peps — paid group-buy access constants and helpers.

/** One-time access fee in Philippine Peso. Admin-priced; shown via formatPrice. */
export const ACCESS_FEE_PHP = 250;

/** localStorage key holding the verified member email (set after admin approval). */
export const ACCESS_EMAIL_KEY = 'pp_access_email';

export type AccessStatus = 'pending' | 'approved' | 'rejected';

export interface AccessRequest {
  id: string;
  email: string;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_proof_url: string | null;
  amount: number;
  status: AccessStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
