import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadCsv } from './downloadCsv';

describe('downloadCsv', () => {
  beforeEach(() => {
    // jsdom implements neither of these; stub them so the helper can run.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a link with the given filename and clicks it', () => {
    const clicks: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      });

    downloadCsv('members.csv', 'a,b,c');

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(clicks).toEqual(['members.csv']);
    // The anchor is cleaned up after clicking.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('revokes the object URL it created', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadCsv('items.csv', 'x');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
