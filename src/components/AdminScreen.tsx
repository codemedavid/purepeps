import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type AdminScreenProps = {
  /** Shown as the screen's only h1. */
  title: string;
  /** One line under the title. Omitted screens simply skip it. */
  description?: string;
  /** Omit on a screen with nowhere to go back to; the button is then absent. */
  onBack?: () => void;
  children: ReactNode;
};

/**
 * The shared frame for an admin view: warm canvas, one width, a mono eyebrow, a
 * Playfair title, an optional description, and an optional way back.
 *
 * Each branch of AdminDashboard used to invent its own container width and
 * background — `max-w-4xl`, `5xl`, `6xl` and `7xl` all appeared, over
 * `bg-gray-50` or one of two different gradients — so no two admin screens
 * announced themselves the same way. This is the one place that decides it.
 *
 * Only wraps views whose panel does NOT already render its own full-screen
 * chrome. Managers like OrdersManager and CategoryManager still paint their own
 * `min-h-screen` and sticky header with an h1 inside; wrapping one of those here
 * would nest two full-screen containers and stack two titles.
 */
function AdminScreen({ title, description, onBack, children }: AdminScreenProps) {
  return (
    <div className="min-h-screen bg-sakura-canvas p-4 md:p-8">
      <div className="mx-auto max-w-6xl pb-16">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-sakura-muted transition-colors hover:text-sakura-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sakura-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        )}

        <header className="border-b border-sakura-edge/70 pb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sakura-soft">
            Pure Peps Admin
          </p>
          <h1 className="mt-2.5 font-heading text-4xl leading-[1.05] text-sakura-ink md:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3.5 max-w-lg text-sm leading-relaxed text-sakura-muted">
              {description}
            </p>
          )}
        </header>

        <div className="mt-10">{children}</div>
      </div>
    </div>
  );
}

export default AdminScreen;
