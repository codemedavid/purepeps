import { useEffect, useMemo, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import StorefrontNoticeModal from './StorefrontNoticeModal';
import {
  NOTICE_AUDIENCES,
  NOTICE_FREQUENCIES,
  NOTICE_PAGE_IDS,
  NOTICE_STYLES,
  fromManilaDatetimeLocal,
  toManilaDatetimeLocal,
  validateNoticeForPublish,
  type NoticePageId,
  type NoticeValidationErrors,
  type StorefrontNotice,
} from '../utils/storefrontNotice';
import { getActionErrorMessage } from '../utils/errorMessage';

interface StorefrontNoticeEditorProps {
  notice: StorefrontNotice;
  onSave: (notice: StorefrontNotice) => Promise<unknown>;
  onPublish: (notice: StorefrontNotice, asNewVersion: boolean) => Promise<unknown>;
  onCancel: () => void;
}

const PAGE_LABELS: Record<NoticePageId, string> = {
  'storefront.menu': 'Menu',
  'storefront.cart': 'Cart',
  'storefront.checkout': 'Checkout',
  'storefront.access': 'Get Access',
  coa: 'Certificates of Analysis',
  faq: 'FAQ',
  calculator: 'Calculator',
  'track-order': 'Track Order',
  protocols: 'Protocols',
};

const inputClass = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200';

export default function StorefrontNoticeEditor({
  notice,
  onSave,
  onPublish,
  onCancel,
}: StorefrontNoticeEditorProps) {
  const [draft, setDraft] = useState<StorefrontNotice>({ ...notice, pageIds: [...notice.pageIds] });
  const [errors, setErrors] = useState<NoticeValidationErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const original = useMemo(() => JSON.stringify(notice), [notice]);
  const dirty = JSON.stringify(draft) !== original;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setField = <K extends keyof StorefrontNotice>(field: K, value: StorefrontNotice[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus(null);
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (err) {
      setStatus(getActionErrorMessage(err, 'Notice action failed'));
    } finally {
      setBusy(false);
    }
  };

  const publish = (asNewVersion: boolean) => {
    const nextErrors = validateNoticeForPublish(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    void run(() => onPublish(draft, asNewVersion));
  };

  const cancel = () => {
    if (!dirty || window.confirm('Discard your unsaved notice changes?')) onCancel();
  };

  const togglePage = (pageId: NoticePageId) => {
    setField('pageIds', draft.pageIds.includes(pageId)
      ? draft.pageIds.filter((item) => item !== pageId)
      : [...draft.pageIds, pageId]);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Notice editor</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900">{notice.id ? notice.internalName : 'Create notice'}</h2>
          <p className="mt-1 text-sm text-gray-500">Schedules use Asia/Manila time.</p>
        </div>
        <button type="button" onClick={cancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Back to notices</button>
      </div>

      <div className="grid gap-8 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-7">
          <section className="space-y-4">
            <h3 className="font-bold text-gray-900">Content</h3>
            <Field label="Internal Name" error={errors.internalName}>
              <input aria-label="Internal Name" className={inputClass} value={draft.internalName} onChange={(e) => setField('internalName', e.target.value)} />
            </Field>
            <Field label="Title" error={errors.title}>
              <input aria-label="Title" className={inputClass} value={draft.title} onChange={(e) => setField('title', e.target.value)} />
            </Field>
            <Field label="Subtitle">
              <input aria-label="Subtitle" className={inputClass} value={draft.subtitle} onChange={(e) => setField('subtitle', e.target.value)} />
            </Field>
            <Field label="Body" hint="Separate paragraphs with a blank line." error={errors.body}>
              <textarea aria-label="Body" rows={7} className={inputClass} value={draft.body} onChange={(e) => setField('body', e.target.value)} />
            </Field>
            <Field label="Highlight Strip">
              <input aria-label="Highlight Strip" className={inputClass} value={draft.highlight} onChange={(e) => setField('highlight', e.target.value)} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Policy Title">
                <input aria-label="Policy Title" className={inputClass} value={draft.policyTitle} onChange={(e) => setField('policyTitle', e.target.value)} />
              </Field>
              <Field label="Policy Lines" hint="One item per line.">
                <textarea aria-label="Policy Lines" rows={4} className={inputClass} value={draft.policyLines} onChange={(e) => setField('policyLines', e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Button Label" error={errors.buttonLabel}>
                <input aria-label="Button Label" className={inputClass} value={draft.buttonLabel} onChange={(e) => setField('buttonLabel', e.target.value)} />
              </Field>
              <Field label="Footer Note">
                <input aria-label="Footer Note" className={inputClass} value={draft.footerNote} onChange={(e) => setField('footerNote', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-6">
            <h3 className="font-bold text-gray-900">Display rules</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Audience">
                <select aria-label="Audience" className={inputClass} value={draft.audience} onChange={(e) => setField('audience', e.target.value as StorefrontNotice['audience'])}>
                  {NOTICE_AUDIENCES.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Frequency">
                <select aria-label="Frequency" className={inputClass} value={draft.frequency} onChange={(e) => setField('frequency', e.target.value as StorefrontNotice['frequency'])}>
                  {NOTICE_FREQUENCIES.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Style">
                <select aria-label="Style" className={inputClass} value={draft.style} onChange={(e) => setField('style', e.target.value as StorefrontNotice['style'])}>
                  {NOTICE_STYLES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Priority" hint="Higher numbers display first.">
                <input aria-label="Priority" type="number" className={inputClass} value={draft.priority} onChange={(e) => setField('priority', Number(e.target.value))} />
              </Field>
              <Field label="Start (Manila time)">
                <input aria-label="Start (Manila time)" type="datetime-local" className={inputClass} value={toManilaDatetimeLocal(draft.startsAt)} onChange={(e) => setField('startsAt', fromManilaDatetimeLocal(e.target.value))} />
              </Field>
              <Field label="End (Manila time)" error={errors.endsAt}>
                <input aria-label="End (Manila time)" type="datetime-local" className={inputClass} value={toManilaDatetimeLocal(draft.endsAt)} onChange={(e) => setField('endsAt', fromManilaDatetimeLocal(e.target.value))} />
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-bold text-gray-700">Pages</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {NOTICE_PAGE_IDS.map((pageId) => (
                  <label key={pageId} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700">
                    <input type="checkbox" checked={draft.pageIds.includes(pageId)} onChange={() => togglePage(pageId)} />
                    {PAGE_LABELS[pageId]}
                  </label>
                ))}
              </div>
              {errors.pageIds && <p className="mt-1 text-xs font-medium text-red-600">{errors.pageIds}</p>}
            </fieldset>
          </section>

          {status && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{status}</p>}
          <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-6">
            <button disabled={busy} type="button" onClick={() => void run(() => onSave(draft))} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-800 disabled:opacity-50">
              {notice.status === 'draft' ? 'Save Draft' : 'Save Changes'}
            </button>
            <button disabled={busy} type="button" onClick={() => publish(false)} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {notice.status === 'published' ? 'Update Published' : 'Publish'}
            </button>
            {notice.publishedAt && (
              <button disabled={busy} type="button" onClick={() => publish(true)} className="rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Publish as New Version</button>
            )}
          </div>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Preview</h3>
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button aria-label="Desktop preview" type="button" onClick={() => setPreview('desktop')} className={`rounded-md p-2 ${preview === 'desktop' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}><Monitor className="h-4 w-4" /></button>
              <button aria-label="Mobile preview" type="button" onClick={() => setPreview('mobile')} className={`rounded-md p-2 ${preview === 'mobile' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}><Smartphone className="h-4 w-4" /></button>
            </div>
          </div>
          <div data-testid="notice-preview" className="min-h-[560px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 p-3">
            <div data-testid="notice-preview-frame" className={`relative mx-auto h-[540px] overflow-hidden ${preview === 'mobile' ? 'max-w-sm' : 'max-w-xl'}`}>
              <div className="absolute inset-0 [&>div]:absolute [&>div]:inset-0 [&>div]:z-0">
                <StorefrontNoticeModal notice={draft} onAccept={() => undefined} isPreview />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-gray-700">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
