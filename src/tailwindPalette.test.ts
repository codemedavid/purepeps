import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import defaultColors from 'tailwindcss/colors';
import tailwindConfig from '../tailwind.config.js';

/**
 * Legibility contract for white-on-dark controls.
 *
 * Tailwind only emits a rule for a class whose colour it can resolve. Write
 * `bg-navy-900` when the config defines no `navy` family and the class is
 * silently dropped — no error, no warning, no background. Pair that with
 * `text-white` and the element renders white text on whatever sits behind it,
 * which on this admin's white cards means an invisible control. That is exactly
 * how the "Print all waybills" button disappeared: it rendered on every page
 * load, in the right place, unreadable.
 *
 * jsdom applies no Tailwind pipeline and computes no colours, so a render test
 * cannot catch this. These assertions resolve the real palette and read the
 * shipped class strings directly.
 */

const SRC = resolve(__dirname);

/** `bg-` utilities that set something other than a colour. */
const NON_COLOUR_BG = new Set([
  'gradient', 'cover', 'contain', 'center', 'top', 'bottom', 'left', 'right',
  'repeat', 'no', 'fixed', 'local', 'scroll', 'clip', 'origin', 'blend',
  'auto', 'none', 'opacity', 'size',
]);

/** Every `bg-*` colour token Tailwind will actually generate for this project. */
function resolvePaletteTokens(): Set<string> {
  const tokens = new Set<string>();
  const palette: Record<string, unknown> = {
    ...defaultColors,
    ...(tailwindConfig.theme?.extend?.colors ?? {}),
  };

  for (const [family, value] of Object.entries(palette)) {
    if (typeof value === 'string') {
      tokens.add(family);
      continue;
    }
    if (value && typeof value === 'object') {
      for (const shade of Object.keys(value)) {
        tokens.add(shade === 'DEFAULT' ? family : `${family}-${shade}`);
      }
    }
  }

  return tokens;
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Colour tokens used by `bg-` utilities on lines that also set `text-white`.
 * Modifiers (`hover:`, `md:`) and opacity suffixes (`/20`) are stripped, since
 * neither changes whether the underlying colour resolves.
 */
function whiteTextBackgrounds(): { site: string; token: string }[] {
  const uses: { site: string; token: string }[] = [];

  for (const file of sourceFiles(SRC)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (!line.includes('text-white')) return;

      for (const match of line.matchAll(/(?:^|[\s"'`:])bg-([a-z]+(?:-[a-z0-9]+)*)(?:\/\d+)?/g)) {
        const token = match[1];
        if (NON_COLOUR_BG.has(token.split('-')[0])) continue;
        uses.push({ site: `${relative(SRC, file)}:${index + 1}`, token });
      }
    });
  }

  return uses;
}

describe('white-on-dark legibility contract', () => {
  const paletteTokens = resolvePaletteTokens();

  // The palette itself must be readable, or the guard below proves nothing.
  it('resolves the project palette from the Tailwind config', () => {
    expect(paletteTokens.has('sakura-dark')).toBe(true);
    expect(paletteTokens.has('brand-400')).toBe(true);
    expect(paletteTokens.has('gray-100')).toBe(true);
  });

  // The reported bug: `text-white` over a background class Tailwind never
  // emits. Listing the offenders in the failure message keeps the fix
  // mechanical instead of a hunt.
  it('never pairs text-white with a background colour Tailwind cannot resolve', () => {
    const unresolved = whiteTextBackgrounds()
      .filter(({ token }) => !paletteTokens.has(token))
      .map(({ site, token }) => `${site} → bg-${token}`);

    expect(unresolved).toEqual([]);
  });
});
