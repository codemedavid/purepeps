import type { ComponentType } from 'react';
import AccessIntakeToggle from './AccessIntakeToggle';
import StorefrontNoticeManager from './StorefrontNoticeManager';
import GbLandingManager from './GbLandingManager';
import { useActiveSection } from '../hooks/useActiveSection';

/**
 * Admin → Settings.
 *
 * Three panels, each owning its own data: who may request access, every string
 * on the public homepage, and every string in the storefront notice.
 *
 * The screen used to be a bare `space-y-8` stack of the three panels, which
 * read as three interchangeable white cards — the 90-line access toggle carried
 * exactly the same visual weight as the 400-line landing-page form, and finding
 * the notice manager meant scrolling past all of it. The shell below adds the
 * hierarchy the stack was missing: a titled header, a sticky rail that names
 * the three areas and jumps to them, and a numbered eyebrow over each panel.
 *
 * The rail scroll-anchors rather than tab-switching, so all three panels stay
 * mounted and keep their own loading and Realtime behaviour untouched.
 *
 * A "General Site Settings" card used to sit below these with a site name,
 * description, logo upload and currency symbol/code. It was removed on the
 * client's request, and nothing on the storefront changed — every one of those
 * fields was inert:
 *
 *  - the header renders a hardcoded `/logo.png`; `site_logo` was never read
 *  - `utils/currency.ts` hardcodes ₱ and PHP; the currency rows were never read
 *  - nothing outside the card itself ever read `site_name` or `site_description`
 *
 * So an admin could fill the fields, press Save, be told "Settings saved
 * successfully!" and change nothing anywhere. The rows themselves are left in
 * `site_settings` — removing the editor does not delete stored data, and other
 * keys in that table (gb_landing_*, feature flags, the notice) are unaffected.
 */

interface SettingsSection {
  /** Anchor target; the rail link points at `#${id}`. */
  id: string;
  /** Short word for the rail. */
  navLabel: string;
  /** Names the landmark, and echoes the panel's own visible heading. */
  landmark: string;
  /** One line under the rail label, so the rail explains rather than just lists. */
  blurb: string;
  Panel: ComponentType;
}

const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'settings-access',
    navLabel: 'Access',
    landmark: 'New Access Requests',
    blurb: 'Who may request paid access',
    Panel: AccessIntakeToggle,
  },
  {
    id: 'settings-homepage',
    navLabel: 'Homepage',
    landmark: 'Group Buy Landing',
    blurb: 'Every string on the public page',
    Panel: GbLandingManager,
  },
  {
    id: 'settings-notices',
    navLabel: 'Notices',
    landmark: 'Storefront Notice Manager',
    blurb: 'Pop-up campaigns and their reach',
    Panel: StorefrontNoticeManager,
  },
];

/** "01", "02", "03" — the rail and the section eyebrows share one index. */
const sectionIndex = (position: number) => String(position + 1).padStart(2, '0');

const SECTION_IDS = SETTINGS_SECTIONS.map((section) => section.id);

function SiteSettingsManager() {
  const activeId = useActiveSection(SECTION_IDS);

  return (
    <div className="pb-16">
      <header className="border-b border-sakura-edge/70 pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sakura-soft">
          Pure Peps Admin
        </p>
        <h1 className="mt-2.5 font-heading text-4xl leading-[1.05] text-sakura-ink md:text-5xl">
          Settings
        </h1>
        <p className="mt-3.5 max-w-lg text-sm leading-relaxed text-sakura-muted">
          Three areas decide what the storefront shows: who gets in, what the homepage says, and
          which notice interrupts it. Every change here is live the moment it saves.
        </p>
      </header>

      <div className="mt-10 grid gap-10 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12">
        <nav aria-label="Settings sections" className="md:sticky md:top-6 md:self-start">
          <ol className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            {SETTINGS_SECTIONS.map((section, position) => (
              <li key={section.id} className="shrink-0 md:shrink">
                <a
                  href={`#${section.id}`}
                  aria-current={activeId === section.id ? 'true' : undefined}
                  className={`group block rounded-xl border px-3 py-2.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sakura-primary/40 active:bg-sakura-blush ${
                    activeId === section.id
                      ? 'border-sakura-edge bg-sakura-blush-soft'
                      : 'border-transparent hover:border-sakura-edge hover:bg-sakura-blush-soft'
                  }`}
                >
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <span
                      className={`font-mono text-[10px] transition-colors group-hover:text-sakura-primary ${
                        activeId === section.id ? 'text-sakura-primary' : 'text-sakura-soft'
                      }`}
                    >
                      {sectionIndex(position)}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        activeId === section.id ? 'text-sakura-deep' : 'text-sakura-ink'
                      }`}
                    >
                      {section.navLabel}
                    </span>
                  </span>
                  <span className="mt-0.5 hidden text-xs leading-snug text-sakura-faint md:block">
                    {section.blurb}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-14">
          {SETTINGS_SECTIONS.map((section, position) => (
            <section
              key={section.id}
              id={section.id}
              aria-label={section.landmark}
              className="scroll-mt-6"
            >
              <p className="mb-3.5 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-sakura-soft">
                <span className="text-sakura-primary">{sectionIndex(position)}</span>
                <span aria-hidden="true" className="h-px w-6 bg-sakura-edge" />
                {section.navLabel}
              </p>
              <section.Panel />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SiteSettingsManager;
