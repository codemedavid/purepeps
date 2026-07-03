import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { useAccessIntake } from '../hooks/useAccessIntake';

/**
 * Admin switch that opens or closes NEW paid access requests. When closed, the
 * storefront hides the Get Access payment form (verify-only) and the DB trigger
 * rejects new requests — used to cap intake when approval capacity is limited.
 * Mounted in both SiteSettingsManager and AccessRequestsManager (single source
 * of truth: the shared `useAccessIntake` hook and its site_settings flag).
 */
function AccessIntakeToggle() {
  const { isIntakeOpen, loading, setIntakeOpen } = useAccessIntake();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setSaving(true);
    setError(null);
    try {
      await setIntakeOpen(!isIntakeOpen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isIntakeOpen ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {isIntakeOpen ? (
              <Unlock className="w-6 h-6 text-emerald-600" />
            ) : (
              <Lock className="w-6 h-6 text-red-600" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Access Requests</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-md">
              {isIntakeOpen
                ? 'Open — new members can submit paid access requests.'
                : 'Closed — only existing approved members can verify. New and renewal requests are blocked.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isIntakeOpen}
          aria-label="Accept new access requests"
          disabled={loading || saving}
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            isIntakeOpen ? 'bg-emerald-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              isIntakeOpen ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
            isIntakeOpen
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-600 border-red-200'
          }`}
        >
          {saving ? 'Saving…' : isIntakeOpen ? 'Accepting requests' : 'Requests closed'}
        </span>
      </div>

      {error && (
        <div role="alert" className="mt-3 text-sm font-medium text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}

export default AccessIntakeToggle;
