import React from 'react';
import { HelpCircle, Truck, FlaskConical, Shield } from 'lucide-react';
import { useFeatureFlagsContext } from '../contexts/FeatureFlagsContext';
import type { FeatureId } from '../utils/featureFlags';

interface QuickLink {
  feature: FeatureId;
  label: string;
  href: string;
  Icon: typeof FlaskConical;
}

const QUICK_LINKS: readonly QuickLink[] = [
  { feature: 'products', label: 'Products', href: '#', Icon: FlaskConical },
  { feature: 'track_order', label: 'Track Order', href: '/track-order', Icon: Truck },
  { feature: 'faq', label: 'FAQ', href: '/faq', Icon: HelpCircle },
  { feature: 'lab_reports', label: 'Lab Reports', href: '/coa', Icon: Shield },
];

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const { flags } = useFeatureFlagsContext();
  // A switched-off feature must leave no live entry point, here included.
  const visibleLinks = QUICK_LINKS.filter((link) => flags[link.feature]);

  return (
    <footer className="bg-charcoal-900 pt-16 pb-8 border-t border-charcoal-800">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">

          {/* Brand Section */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="Pure Peps"
                className="h-12 w-auto object-contain"
              />
            </div>
            <p className="text-charcoal-400 text-sm max-w-xs text-center md:text-left">
              Research-grade peptide group buys. Lab-tested, member-priced, shipped cold-chain.
            </p>
          </div>

          {/* Quick Links */}
          {visibleLinks.length > 0 && (
            <div className="flex flex-col items-center md:items-start gap-3">
              <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-2">Quick Links</h3>
              {visibleLinks.map(({ feature, label, href, Icon }) => (
                <a
                  key={feature}
                  href={href}
                  className="text-charcoal-300 hover:text-brand-400 transition-colors flex items-center gap-2 text-sm"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </a>
              ))}
            </div>
          )}

        </div>

        {/* Divider */}
        <div className="h-px bg-charcoal-800 mb-6" />

        {/* Footer Bottom */}
        <div className="text-center">
          <p className="text-xs text-charcoal-500 flex items-center justify-center gap-1 font-mono uppercase tracking-[0.05em]">
            Research use only · not for human consumption · © {currentYear} Pure Peps
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
