import React from 'react';
import AccessIntakeToggle from './AccessIntakeToggle';
import StorefrontNoticeManager from './StorefrontNoticeManager';
import GbLandingManager from './GbLandingManager';

/**
 * Admin → Settings.
 *
 * Three panels, each owning its own data: who may request access, every string
 * on the public homepage, and every string in the storefront notice.
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
const SiteSettingsManager: React.FC = () => (
  <div className="space-y-8 pb-12">
    {/* Access request intake switch (shared with the Access Requests view). */}
    <AccessIntakeToggle />

    {/* Every string on the public homepage. */}
    <GbLandingManager />

    {/* Every string in the storefront's Important Notice pop-up. */}
    <StorefrontNoticeManager />
  </div>
);

export default SiteSettingsManager;
