import React from 'react';
import { HelpCircle, Truck, FlaskConical, Shield } from 'lucide-react';
import BlossomLogo from './BlossomLogo';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-charcoal-900 pt-16 pb-8 border-t border-charcoal-800">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">

          {/* Brand Section */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2.5">
              <BlossomLogo size={28} />
              <span className="text-white font-display font-extrabold text-xl tracking-[-0.03em]">
                Pure Peps
              </span>
            </div>
            <p className="text-charcoal-400 text-sm max-w-xs text-center md:text-left">
              Research-grade peptide group buys. Lab-tested, member-priced, shipped cold-chain.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-2">Quick Links</h3>
            <a
              href="#"
              className="text-charcoal-300 hover:text-brand-400 transition-colors flex items-center gap-2 text-sm"
            >
              <FlaskConical className="w-4 h-4" />
              Products
            </a>
            <a
              href="/track-order"
              className="text-charcoal-300 hover:text-brand-400 transition-colors flex items-center gap-2 text-sm"
            >
              <Truck className="w-4 h-4" />
              Track Order
            </a>
            <a
              href="/faq"
              className="text-charcoal-300 hover:text-brand-400 transition-colors flex items-center gap-2 text-sm"
            >
              <HelpCircle className="w-4 h-4" />
              FAQ
            </a>
            <a
              href="/coa"
              className="text-charcoal-300 hover:text-brand-400 transition-colors flex items-center gap-2 text-sm"
            >
              <Shield className="w-4 h-4" />
              Lab Reports
            </a>
          </div>

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
