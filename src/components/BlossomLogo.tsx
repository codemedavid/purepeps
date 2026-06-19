interface BlossomLogoProps {
  size?: number;
  /** Render a single flat-tint blossom (footer/hero watermark) instead of the two-tone mark. */
  monochrome?: string;
  className?: string;
}

const PETAL = 'M12 12 C 8.6 9.2 8.6 4.4 12 2.2 C 15.4 4.4 15.4 9.2 12 12 Z';
const ANGLES = [0, 72, 144, 216, 288];

/**
 * Pure Peps sakura blossom mark — five petals rotated around a center dot.
 * Mirrors the logo from the Pure Peps design handoff.
 */
export function BlossomLogo({ size = 24, monochrome, className }: BlossomLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g>
        {ANGLES.map((angle, i) => (
          <path
            key={angle}
            d={PETAL}
            fill={monochrome ?? (i % 2 === 0 ? '#E87BA0' : '#D6446F')}
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
      </g>
      {!monochrome && <circle cx="12" cy="12" r="2" fill="#17100D" />}
    </svg>
  );
}

export default BlossomLogo;
