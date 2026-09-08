/// <reference types="vite/client" />

/**
 * `tailwind.config.js` ships as plain JS with no bundled types. Only the colour
 * palette is ever imported (by the white-on-dark legibility guard), so declare
 * exactly that much rather than pulling in Tailwind's own config types.
 */
declare module '*/tailwind.config.js' {
  const config: {
    theme?: { extend?: { colors?: Record<string, unknown> } };
  };
  export default config;
}
