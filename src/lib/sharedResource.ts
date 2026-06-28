/**
 * A tiny shared, cached async resource — one fetch shared across every consumer.
 *
 * Hooks built on this fetch their data once and keep it in a module-level cache,
 * so navigating away and back does not re-fetch or flash a loading skeleton, and
 * multiple components reading the same resource (e.g. several useCategories
 * callers) trigger a single network request instead of one each.
 *
 * It is intentionally minimal (no stale-while-revalidate, no TTL) — invalidation
 * is explicit via refresh(), called after admin writes or on realtime events.
 */

export interface ResourceState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

type Listener = () => void;

interface CreateSharedResourceOptions<T> {
  /** Loads the resource. Its resolved value becomes the cached data. */
  fetcher: () => Promise<T>;
  /** Initial data shown while the first fetch is in flight. */
  initial: T;
  /**
   * Runs when the resource gains its first subscriber (listener count 0 -> 1),
   * receiving a refresh callback (e.g. to wire a realtime subscription). The
   * returned cleanup runs when the last subscriber leaves (1 -> 0). Running it
   * lazily means we open at most one channel, and only while something is mounted.
   */
  onActive?: (refresh: () => Promise<void>) => (() => void) | void;
}

export interface SharedResource<T> {
  getState: () => ResourceState<T>;
  subscribe: (listener: Listener) => () => void;
  /** Fetch once; resolves immediately (no network) if already cached. */
  ensureLoaded: () => Promise<void>;
  /** Force a refetch regardless of cache state. */
  refresh: () => Promise<void>;
  /** Seed the cache directly (marks it loaded, skips the next fetch). */
  setData: (data: T) => void;
  /** Clear the cache back to its initial, un-loaded state. For tests. */
  reset: () => void;
}

// Registry of every shared resource so tests can clear all caches between runs.
const registry = new Set<{ reset: () => void }>();

/** Reset every shared resource to its initial state. Test-only helper. */
export function resetAllSharedResources(): void {
  for (const resource of registry) resource.reset();
}

function toMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function createSharedResource<T>({
  fetcher,
  initial,
  onActive,
}: CreateSharedResourceOptions<T>): SharedResource<T> {
  let state: ResourceState<T> = { data: initial, loading: true, error: null };
  const listeners = new Set<Listener>();
  let inFlight: Promise<void> | null = null;
  let hasLoaded = false;
  let activeCleanup: (() => void) | null = null;

  const emit = () => {
    // Copy first: a listener may unsubscribe during iteration.
    for (const listener of [...listeners]) listener();
  };

  const setState = (next: ResourceState<T>) => {
    state = next;
    emit();
  };

  const load = (force: boolean): Promise<void> => {
    if (inFlight) return inFlight; // dedupe concurrent callers
    if (hasLoaded && !force) return Promise.resolve(); // serve cache

    setState({ ...state, loading: true, error: null });
    inFlight = (async () => {
      try {
        const data = await fetcher();
        hasLoaded = true;
        setState({ data, loading: false, error: null });
      } catch (err) {
        setState({ ...state, loading: false, error: toMessage(err, 'Failed to load') });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const resource: SharedResource<T> = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && onActive) {
        activeCleanup = onActive(() => load(true)) ?? null;
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && activeCleanup) {
          activeCleanup();
          activeCleanup = null;
        }
      };
    },
    ensureLoaded: () => load(false),
    refresh: () => load(true),
    setData(data) {
      hasLoaded = true;
      setState({ data, loading: false, error: null });
    },
    reset() {
      hasLoaded = false;
      inFlight = null;
      state = { data: initial, loading: true, error: null };
      emit();
    },
  };

  registry.add(resource);
  return resource;
}
