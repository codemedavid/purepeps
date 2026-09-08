import { useEffect, useState } from 'react';

/**
 * A section counts as "reached" while it overlaps the top half of the viewport.
 * The band has to start close to the top edge, or the first section is already
 * past it when the page is at rest and the rail highlights nothing.
 */
const ACTIVE_BAND = '-5% 0px -50% 0px';

/**
 * Tracks which of `sectionIds` is currently in view, so a scroll-anchored nav
 * rail can mark where the reader is.
 *
 * Returns null until a section intersects, and stays null on browsers with no
 * IntersectionObserver — callers should read that as "highlight nothing", not
 * as a failure. The rail's anchor links are plain hrefs and keep working either
 * way, so losing the highlight costs nothing but the highlight.
 */
export function useActiveSection(sectionIds: readonly string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Callers map over a literal, so a fresh array arrives on every render.
  // Keying the effect on the ids themselves rather than the array identity
  // stops the observer being torn down and rebuilt on every commit.
  const key = sectionIds.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const ids = key ? key.split('|') : [];
    if (ids.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);

        // Nothing in the band — between two sections, or scrolled past the
        // last one. Keep the previous highlight rather than blanking the rail.
        if (visible.length === 0) return;

        // Several can share the band mid-scroll; the one earliest on the page
        // is the one the reader has reached.
        const topmost = visible.reduce((earliest, entry) =>
          ids.indexOf(entry.target.id) < ids.indexOf(earliest.target.id) ? entry : earliest,
        );

        setActiveId(topmost.target.id);
      },
      { rootMargin: ACTIVE_BAND },
    );

    ids.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [key]);

  return activeId;
}
