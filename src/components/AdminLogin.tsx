import { useState } from 'react';
import type { AdminSignInResult } from '../hooks/useAdminAuth';

interface AdminLoginProps {
  /** Wired to useAdminAuth().signIn — validates credentials and admin membership. */
  onSignIn: (email: string, password: string) => Promise<AdminSignInResult>;
  /** Sign-in error from the auth hook (invalid credentials / not authorized). */
  error: string | null;
}

/**
 * Admin login form backed by Supabase Auth. No password lives in the bundle —
 * credentials are checked server-side, and only users in admin_users are let in.
 */
function AdminLogin({ onSignIn, error }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    await onSignIn(email, password);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 w-full max-w-md border border-gray-200">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4">
            <img
              src="/logo.jpeg?v=2"
              alt="The Babe Studio"
              className="h-14 w-auto mx-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin Access</h1>
          <p className="text-sm text-gray-400">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-navy-900 focus:border-transparent transition-colors placeholder-gray-400"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-navy-900 focus:border-transparent transition-colors placeholder-gray-400"
              placeholder="Enter admin password"
              required
            />
            {error && (
              <p className="text-red-500 text-sm mt-2 flex items-center gap-1" role="alert">
                ❌ {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLogin;
