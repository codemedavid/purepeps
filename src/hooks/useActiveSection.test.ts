import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useActiveSection } from './useActiveSection';

/**
 * Captures the callback each observer is constructed with, so a test can drive
 * intersections by hand instead of scrolling a real layout.
 */
function installFakeObserver() {
  const instances: Array<{
    callback: IntersectionObserverCallback;
    observed: Element[];
    disconnected: boolean;
  }> = [];

  class FakeIntersectionObserver {
    callback: IntersectionObserverCallback;
    observed: Element[] = [];
    disconnected = false;

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      instances.push(this);
    }

    observe(element: Element) {
      this.observed.push(element);
    }

    disconnect() {
      this.disconnected = true;
    }

    unobserve() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  return instances;
}

/** Minimal entry — the hook only reads isIntersecting and target.id. */
const entryFor = (id: string, isIntersecting: boolean) =>
  ({
    target: { id } as Element,
    isIntersecting,
  }) as IntersectionObserverEntry;

const SECTION_IDS = ['settings-access', 'settings-homepage', 'settings-notices'];

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useActiveSection', () => {
  it('reports no active section before anything has intersected', () => {
    installFakeObserver();

    const { result } = renderHook(() => useActiveSection(SECTION_IDS));

    expect(result.current).toBeNull();
  });

  it('reports the section that scrolled into view', () => {
    SECTION_IDS.forEach((id) => {
      const el = document.createElement('section');
      el.id = id;
      document.body.appendChild(el);
    });
    const observers = installFakeObserver();

    const { result } = renderHook(() => useActiveSection(SECTION_IDS));
    act(() => observers[0].callback([entryFor('settings-homepage', true)], {} as IntersectionObserver));

    expect(result.current).toBe('settings-homepage');
  });

  it('keeps the last section that was in view once it scrolls back out', () => {
    SECTION_IDS.forEach((id) => {
      const el = document.createElement('section');
      el.id = id;
      document.body.appendChild(el);
    });
    const observers = installFakeObserver();

    const { result } = renderHook(() => useActiveSection(SECTION_IDS));
    act(() => observers[0].callback([entryFor('settings-notices', true)], {} as IntersectionObserver));
    act(() => observers[0].callback([entryFor('settings-notices', false)], {} as IntersectionObserver));

    expect(result.current).toBe('settings-notices');
  });

  it('survives a browser with no IntersectionObserver instead of throwing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    const { result } = renderHook(() => useActiveSection(SECTION_IDS));

    expect(result.current).toBeNull();
  });

  it('stops observing when the screen unmounts', () => {
    SECTION_IDS.forEach((id) => {
      const el = document.createElement('section');
      el.id = id;
      document.body.appendChild(el);
    });
    const observers = installFakeObserver();

    const { unmount } = renderHook(() => useActiveSection(SECTION_IDS));
    unmount();

    expect(observers[0].disconnected).toBe(true);
  });

  it('does not rebuild the observer when the caller passes a fresh array of the same ids', () => {
    SECTION_IDS.forEach((id) => {
      const el = document.createElement('section');
      el.id = id;
      document.body.appendChild(el);
    });
    const observers = installFakeObserver();

    // A caller mapping over a literal every render is the normal case; the hook
    // must key off the ids themselves, not the array identity, or the effect
    // tears down and rebuilds forever.
    const { rerender } = renderHook(() => useActiveSection([...SECTION_IDS]));
    rerender();
    rerender();

    expect(observers).toHaveLength(1);
  });
});
