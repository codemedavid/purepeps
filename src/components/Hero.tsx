import { useEffect, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import BlossomLogo from './BlossomLogo';

interface HeroProps {
  onShopAll: () => void;
  onGetAccess: () => void;
}

const TRUST = ['≥99% HPLC', '3rd-party CoA', 'Cold-chain shipped', 'Research use only'];

function Hero({ onShopAll, onGetAccess }: HeroProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="bg-sakura-canvas font-display">
      {/* HERO */}
      <div className="relative flex flex-col items-center text-center px-6 pt-24 pb-24 overflow-hidden">
        {/* faint blossom watermark */}
        <BlossomLogo
          monochrome="#F4DCE4"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] opacity-50 pointer-events-none"
        />

        <div
          className={`relative w-full max-w-3xl flex flex-col items-center transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="font-mono inline-flex items-center gap-2.5 text-xs font-semibold tracking-[0.08em] uppercase text-sakura-deep mb-6">
            <span className="relative inline-flex">
              <span className="w-[7px] h-[7px] rounded-full bg-sakura-primary" />
              <span className="absolute inset-0 rounded-full bg-sakura-primary animate-pp-pulse" />
            </span>
            Group Buy №042 · open now
          </div>

          <h1 className="m-0 text-5xl md:text-7xl font-extrabold tracking-[-0.045em] text-sakura-ink leading-[0.97]">
            Research peptides,
            <br />
            <span className="text-sakura-primary">priced by the crowd.</span>
          </h1>

          <p className="mt-7 text-lg md:text-xl leading-relaxed text-sakura-muted max-w-xl">
            Third-party tested vials, ≥99% HPLC verified. Pool your order with the group and every
            vial gets cheaper as members commit.
          </p>

          <div className="flex flex-col sm:flex-row gap-3.5 mt-9 justify-center">
            <button
              onClick={onShopAll}
              className="inline-flex items-center justify-center gap-2 bg-sakura-primary hover:bg-sakura-deep text-white rounded-full px-8 py-4 text-[17px] font-semibold tracking-[-0.01em] transition-colors group"
            >
              Browse the catalog
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onGetAccess}
              className="inline-flex items-center justify-center gap-2 text-sakura-ink border border-sakura-ink/20 hover:bg-sakura-ink/[0.04] rounded-full px-7 py-4 text-[17px] font-semibold tracking-[-0.01em] transition-colors"
            >
              <Lock className="w-4 h-4" /> Get access
            </button>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-3.5 mt-9 font-mono text-xs tracking-[0.05em] uppercase text-sakura-faint">
            <span className="text-sakura-deep font-semibold">№042</span>
            <span className="w-1 h-1 rounded-full bg-sakura-primary" />
            <span>38/50 claimed</span>
            <span className="w-1 h-1 rounded-full bg-sakura-primary" />
            <span>closes 2d 14h</span>
          </div>
        </div>
      </div>

      {/* TRUST STRIP */}
      <div className="flex justify-center flex-wrap gap-x-9 gap-y-2 px-6 py-[18px] bg-sakura-ink font-mono text-xs font-medium tracking-[0.05em] uppercase text-[#C9B6BD]">
        {TRUST.map((item, i) => (
          <span key={item} className="flex items-center gap-9">
            {item}
            {i < TRUST.length - 1 && <span className="text-[#4A3B41]">/</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default Hero;
