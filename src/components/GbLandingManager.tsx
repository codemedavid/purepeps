import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, Save } from 'lucide-react';
import { useGbLanding } from '../hooks/useGbLanding';
import {
  DEFAULT_GB_LANDING,
  GB_CTA_ACTIONS,
  GB_STAGE_ICONS,
  GB_STAGE_INDEXES,
  GB_STATUS_MODES,
  type GbCtaAction,
  type GbLandingContent,
  type GbStage,
  type GbStageIcon,
  type GbStatusMode,
} from '../utils/gbLanding';
import { getActionErrorMessage } from '../utils/errorMessage';

const inputClass =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200';

const STATUS_LABEL: Record<GbStatusMode, string> = {
  auto: 'Auto — follow the live batch',
  open: 'Open — always show OPEN',
  closed: 'Closed — always show CLOSED',
};

const ACTION_LABEL: Record<GbCtaAction, string> = {
  catalog: 'Show the catalog',
  access: 'Open Get Access',
  cart: 'Open the cart',
  track_order: 'Go to Track Order',
  faq: 'Go to FAQ',
  reviews: 'Go to Customer Reviews',
  none: 'Nothing — hide this button',
};

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

/**
 * Admin -> Settings -> Group Buy Landing.
 *
 * Edits every string the public homepage renders. The status and both CTA
 * destinations are <select>s over closed whitelists rather than free text: a
 * CTA value drives an in-app navigation, and a typed URL there would be one
 * typo away from pointing the homepage's main button at anything at all.
 */
function GbLandingManager() {
  const { content, loading, error, save } = useGbLanding();
  const [draft, setDraft] = useState<GbLandingContent>(DEFAULT_GB_LANDING);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Re-seed the form whenever the stored copy changes (first load, or another
  // admin's edit arriving over Realtime).
  useEffect(() => {
    setDraft(content);
  }, [content]);

  const setField = <K extends keyof GbLandingContent>(field: K, value: GbLandingContent[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const setStageField = <K extends keyof GbStage>(index: number, field: K, value: GbStage[K]) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, position) =>
        position === index ? { ...stage, [field]: value } : stage,
      ) as unknown as GbLandingContent['stages'],
    }));

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      await save(draft);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setSaveError(getActionErrorMessage(err, 'Failed to save the Group Buy landing page'));
    } finally {
      setIsSaving(false);
    }
  };

  const message = saveError ?? error;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-gray-100 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-50 p-2.5">
            <CalendarClock className="h-6 w-6 text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Group Buy Landing</h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Everything on the homepage: the status badge, headline, description, the four
              timeline stages and both buttons. Changes appear on the site as soon as they save.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs font-medium text-emerald-600">Saved {savedAt}</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {message && (
        <p role="alert" className="mx-6 mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}

      <div className="space-y-8 p-6">
        {/* Header section */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Group Buy status" hint="Auto keeps the badge honest about the live batch.">
            <select
              aria-label="Group Buy status"
              value={draft.statusMode}
              onChange={(event) => setField('statusMode', event.target.value as GbStatusMode)}
              className={inputClass}
            >
              {GB_STATUS_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {STATUS_LABEL[mode]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status text" hint='Shown before the Open/Closed word, e.g. "Group Buy".'>
            <input
              aria-label="Status text"
              value={draft.statusText}
              onChange={(event) => setField('statusText', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Main headline">
            <input
              aria-label="Main headline"
              value={draft.headline}
              onChange={(event) => setField('headline', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Highlighted headline text" hint="Shown in the accent colour. Blank hides it.">
            <input
              aria-label="Highlighted headline text"
              value={draft.headlineHighlight}
              onChange={(event) => setField('headlineHighlight', event.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Description / subheadline">
              <textarea
                aria-label="Description / subheadline"
                value={draft.description}
                onChange={(event) => setField('description', event.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Timeline section title">
            <input
              aria-label="Timeline section title"
              value={draft.timelineTitle}
              onChange={(event) => setField('timelineTitle', event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Stages */}
        <div className="space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Timeline stages
          </h3>

          {GB_STAGE_INDEXES.map((index) => {
            const stage = draft.stages[index];
            const number = index + 1;

            return (
              <fieldset key={number} className="rounded-xl border border-gray-200 p-4">
                <legend className="px-2 text-sm font-bold text-gray-900">Stage {number}</legend>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={`Stage ${number} title`}>
                    <input
                      aria-label={`Stage ${number} title`}
                      value={stage.title}
                      onChange={(event) => setStageField(index, 'title', event.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field label={`Stage ${number} icon`}>
                    <select
                      aria-label={`Stage ${number} icon`}
                      value={stage.icon}
                      onChange={(event) =>
                        setStageField(index, 'icon', event.target.value as GbStageIcon)
                      }
                      className={inputClass}
                    >
                      {GB_STAGE_ICONS.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="md:col-span-2">
                    <Field label={`Stage ${number} description`}>
                      <textarea
                        aria-label={`Stage ${number} description`}
                        value={stage.description}
                        onChange={(event) =>
                          setStageField(index, 'description', event.target.value)
                        }
                        rows={2}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field
                    label={`Stage ${number} date`}
                    hint='Free text, e.g. "Sep 19" or "Oct 10 - 18". Blank hides it.'
                  >
                    <input
                      aria-label={`Stage ${number} date`}
                      value={stage.date}
                      onChange={(event) => setStageField(index, 'date', event.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field
                    label={`Stage ${number} time`}
                    hint='Free text, e.g. "5:00 PM" or "Estimated". Blank hides it.'
                  >
                    <input
                      aria-label={`Stage ${number} time`}
                      value={stage.time}
                      onChange={(event) => setStageField(index, 'time', event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </fieldset>
            );
          })}
        </div>

        {/* Calls to action */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary CTA text" hint="Blank hides the button.">
            <input
              aria-label="Primary CTA text"
              value={draft.primaryCtaLabel}
              onChange={(event) => setField('primaryCtaLabel', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Primary CTA action">
            <select
              aria-label="Primary CTA action"
              value={draft.primaryCtaAction}
              onChange={(event) => setField('primaryCtaAction', event.target.value as GbCtaAction)}
              className={inputClass}
            >
              {GB_CTA_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABEL[action]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Secondary CTA text" hint="Blank hides the button.">
            <input
              aria-label="Secondary CTA text"
              value={draft.secondaryCtaLabel}
              onChange={(event) => setField('secondaryCtaLabel', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Secondary CTA action">
            <select
              aria-label="Secondary CTA action"
              value={draft.secondaryCtaAction}
              onChange={(event) =>
                setField('secondaryCtaAction', event.target.value as GbCtaAction)
              }
              className={inputClass}
            >
              {GB_CTA_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABEL[action]}
                </option>
              ))}
            </select>
          </Field>

          <div className="md:col-span-2">
            <Field label="Bottom supporting text" hint="Blank hides it.">
              <input
                aria-label="Bottom supporting text"
                value={draft.bottomNote}
                onChange={(event) => setField('bottomNote', event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GbLandingManager;
