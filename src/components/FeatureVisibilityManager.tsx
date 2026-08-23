import { useState } from 'react';
import { Eye, EyeOff, ToggleRight } from 'lucide-react';
import { useFeatureFlagsContext } from '../contexts/FeatureFlagsContext';
import { FEATURE_DEFINITIONS, type FeatureId } from '../utils/featureFlags';
import { getActionErrorMessage } from '../utils/errorMessage';

/**
 * Admin → Features. One switch per storefront feature.
 *
 * Switching a feature off hides it from the site navigation and makes its page
 * redirect home. It writes a single `site_settings` row and never deletes any
 * products, protocols, FAQs, lab reports or orders — switching it back on
 * restores the feature exactly as it was.
 */
function FeatureVisibilityManager() {
  const { flags, loading, setFeatureEnabled } = useFeatureFlagsContext();
  const [savingId, setSavingId] = useState<FeatureId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (id: FeatureId, nextEnabled: boolean) => {
    setSavingId(id);
    setError(null);
    try {
      await setFeatureEnabled(id, nextEnabled);
    } catch (err) {
      setError(getActionErrorMessage(err, 'Failed to update feature visibility.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <header className="p-6 border-b border-gray-100 flex items-start gap-3">
        <div className="p-2 bg-indigo-50 rounded-lg">
          <ToggleRight className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Feature Visibility</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Turn a feature off to hide it from the site navigation and make its page
            inaccessible to customers. Nothing is deleted — every product, protocol,
            FAQ and lab report stays saved, and switching it back on restores it.
          </p>
        </div>
      </header>

      <ul className="divide-y divide-gray-100">
        {FEATURE_DEFINITIONS.map((feature) => {
          const isEnabled = flags[feature.id];
          const isSaving = savingId === feature.id;

          return (
            <li key={feature.id} className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${isEnabled ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                  {isEnabled ? (
                    <Eye className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{feature.label}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{feature.description}</p>
                  <span
                    className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                      isEnabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {isSaving ? 'Saving…' : isEnabled ? 'Visible to customers' : 'Hidden'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={`Show ${feature.label} on the website`}
                disabled={loading || isSaving}
                onClick={() => handleToggle(feature.id, !isEnabled)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  isEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    isEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <div role="alert" className="px-5 pb-5 text-sm font-medium text-red-500">
          {error}
        </div>
      )}
    </section>
  );
}

export default FeatureVisibilityManager;
