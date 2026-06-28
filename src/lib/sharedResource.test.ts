import { describe, it, expect, vi } from 'vitest';
import { createSharedResource } from './sharedResource';

describe('createSharedResource', () => {
  it('starts in a loading state with the provided initial data', () => {
    const resource = createSharedResource({
      fetcher: async () => [1, 2, 3],
      initial: [] as number[],
    });

    const state = resource.getState();
    expect(state.loading).toBe(true);
    expect(state.data).toEqual([]);
    expect(state.error).toBeNull();
  });

  it('fetches once on ensureLoaded and stores the result', async () => {
    const fetcher = vi.fn(async () => ['a']);
    const resource = createSharedResource({ fetcher, initial: [] as string[] });

    await resource.ensureLoaded();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(resource.getState()).toEqual({ data: ['a'], loading: false, error: null });
  });

  it('dedupes concurrent ensureLoaded calls into a single fetch', async () => {
    // A manually-resolved deferred keeps the fetch in flight while all three
    // callers register, without relying on real timers.
    let resolveFetch!: (value: string[]) => void;
    const fetcher = vi.fn(
      () => new Promise<string[]>((resolve) => { resolveFetch = resolve; }),
    );
    const resource = createSharedResource({ fetcher, initial: [] as string[] });

    const all = Promise.all([
      resource.ensureLoaded(),
      resource.ensureLoaded(),
      resource.ensureLoaded(),
    ]);
    resolveFetch(['x']);
    await all;

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves cached data without refetching on subsequent ensureLoaded calls', async () => {
    const fetcher = vi.fn(async () => ['cached']);
    const resource = createSharedResource({ fetcher, initial: [] as string[] });

    await resource.ensureLoaded();
    await resource.ensureLoaded();
    await resource.ensureLoaded();

    expect(fetcher).toHaveBeenCalledTimes(1);
    // A consumer mounting after the first load sees data immediately, not loading.
    expect(resource.getState().loading).toBe(false);
  });

  it('refresh() forces a refetch even when cached', async () => {
    let n = 0;
    const fetcher = vi.fn(async () => [++n]);
    const resource = createSharedResource({ fetcher, initial: [] as number[] });

    await resource.ensureLoaded();
    await resource.refresh();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resource.getState().data).toEqual([2]);
  });

  it('notifies subscribers on state change and stops after unsubscribe', async () => {
    const fetcher = async () => ['v'];
    const resource = createSharedResource({ fetcher, initial: [] as string[] });
    const listener = vi.fn();

    const unsubscribe = resource.subscribe(listener);
    await resource.ensureLoaded();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    await resource.refresh();
    expect(listener).not.toHaveBeenCalled();
  });

  it('runs onActive on first subscribe and its cleanup on last unsubscribe', () => {
    const cleanup = vi.fn();
    const onActive = vi.fn(() => cleanup);
    const resource = createSharedResource({
      fetcher: async () => [],
      initial: [] as number[],
      onActive,
    });

    const unsub1 = resource.subscribe(() => {});
    const unsub2 = resource.subscribe(() => {});
    expect(onActive).toHaveBeenCalledTimes(1); // only on 0 -> 1
    expect(cleanup).not.toHaveBeenCalled();

    unsub1();
    expect(cleanup).not.toHaveBeenCalled(); // still one listener left
    unsub2();
    expect(cleanup).toHaveBeenCalledTimes(1); // 1 -> 0
  });

  it('keeps prior data and records the error message when the fetcher rejects', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('boom');
    });
    const resource = createSharedResource({ fetcher, initial: ['keep'] as string[] });

    await resource.ensureLoaded();

    const state = resource.getState();
    expect(state.data).toEqual(['keep']);
    expect(state.loading).toBe(false);
    expect(state.error).toBe('boom');
  });

  it('setData seeds the cache so ensureLoaded does not fetch', async () => {
    const fetcher = vi.fn(async () => ['fetched']);
    const resource = createSharedResource({ fetcher, initial: [] as string[] });

    resource.setData(['seeded']);
    await resource.ensureLoaded();

    expect(fetcher).not.toHaveBeenCalled();
    expect(resource.getState().data).toEqual(['seeded']);
  });
});
