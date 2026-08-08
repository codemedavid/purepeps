import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { useStorefrontNotice } from '../hooks/useStorefrontNotice';
import { StorefrontNotice } from '../utils/storefrontNotice';
import { getActionErrorMessage } from '../utils/errorMessage';
import StorefrontNoticeModal from './StorefrontNoticeModal';

type TextField = Exclude<keyof StorefrontNotice, 'isEnabled'>;

interface FieldConfig {
  name: TextField;
  label: string;
  hint?: string;
  rows?: number;
  placeholder?: string;
}

const FIELDS: readonly FieldConfig[] = [
  { name: 'title', label: 'Title', placeholder: 'Important Notice' },
  { name: 'subtitle', label: 'Subtitle', placeholder: 'Please read before continuing' },
  {
    name: 'body',
    label: 'Body',
    hint: 'Separate paragraphs with a blank line.',
    rows: 8,
  },
  {
    name: 'highlight',
    label: 'Highlight Strip',
    hint: 'Single-line callout. Leave blank to hide it.',
  },
  { name: 'policyTitle', label: 'Policy Title', hint: 'Leave blank to hide the policy heading.' },
  {
    name: 'policyLines',
    label: 'Policy Lines',
    hint: 'One line per row. Leave blank to hide the policy card.',
    rows: 5,
  },
  { name: 'buttonLabel', label: 'Button Label', placeholder: 'I Understand & Agree' },
  { name: 'footerNote', label: 'Footer Note', hint: 'Small print under the button. Leave blank to hide it.' },
];

const inputClass =
  'w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all';

/** Admin editor for every string in the storefront Important Notice modal. */
export default function StorefrontNoticeManager() {
  const { notice, loading, saveNotice } = useStorefrontNotice();
  const [draft, setDraft] = useState<StorefrontNotice>(notice);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Adopt the stored notice once it arrives (and whenever a save refreshes it).
  useEffect(() => {
    setDraft(notice);
  }, [notice]);

  const handleFieldChange = (name: TextField, value: string) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setStatus(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      await saveNotice(draft);
      setStatus({ kind: 'success', message: 'Notice saved.' });
    } catch (err) {
      setStatus({ kind: 'error', message: getActionErrorMessage(err, 'Failed to save the notice') });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading notice...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-brand-50 rounded-lg">
            <BellRing className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Storefront Notice</h2>
            <p className="text-sm text-gray-500 mt-1">
              The pop-up shoppers must acknowledge on every visit to the storefront.
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-gray-900 hover:bg-gray-800 text-white font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Notice'}
        </button>
      </div>

      <div className="p-6 space-y-6">
        <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={draft.isEnabled}
            onChange={(event) => {
              setDraft((prev) => ({ ...prev, isEnabled: event.target.checked }));
              setStatus(null);
            }}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          Show this notice on the storefront
        </label>

        {FIELDS.map(({ name, label, hint, rows, placeholder }) => (
          <div key={name}>
            <label htmlFor={`notice-${name}`} className="block text-sm font-bold text-gray-700 mb-2">
              {label}
            </label>
            {rows ? (
              <textarea
                id={`notice-${name}`}
                value={draft[name]}
                onChange={(event) => handleFieldChange(name, event.target.value)}
                rows={rows}
                placeholder={placeholder}
                className={`${inputClass} resize-none`}
              />
            ) : (
              <input
                id={`notice-${name}`}
                type="text"
                value={draft[name]}
                onChange={(event) => handleFieldChange(name, event.target.value)}
                placeholder={placeholder}
                className={inputClass}
              />
            )}
            {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
          </div>
        ))}

        {status && (
          <p
            className={`text-sm font-medium ${status.kind === 'success' ? 'text-green-600' : 'text-red-600'}`}
            role="status"
          >
            {status.message}
          </p>
        )}

        <div>
          <p className="text-sm font-bold text-gray-700 mb-2">Live Preview</p>
          {/* The real modal, scaled into the page so admins see exactly what ships. */}
          <div
            data-testid="notice-preview"
            className="relative h-[520px] overflow-hidden rounded-xl border border-gray-200 bg-gray-100"
          >
            <div className="absolute inset-0 [&>div]:absolute [&>div]:inset-0 [&>div]:z-0">
              <StorefrontNoticeModal notice={draft} onAccept={() => undefined} isPreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
