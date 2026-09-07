import { describe, it, expect } from 'vitest';
import { isPdfFile } from './protocolFiles';

describe('isPdfFile', () => {
  it('treats a PDF as drawable', () => {
    expect(isPdfFile('https://ik.imagekit.io/x/protocol-files/a.pdf')).toBe(true);
  });

  it('ignores letter case in the extension', () => {
    expect(isPdfFile('https://ik.imagekit.io/x/protocol-files/a.PDF')).toBe(true);
  });

  it('ignores a query string after the extension', () => {
    expect(isPdfFile('https://ik.imagekit.io/x/a.pdf?updatedAt=1712345')).toBe(true);
  });

  it('rejects an office document the viewer cannot draw', () => {
    expect(isPdfFile('https://ik.imagekit.io/x/protocol-files/a.docx')).toBe(false);
  });

  it('rejects an image, which its own surface renders directly', () => {
    expect(isPdfFile('https://ik.imagekit.io/x/coa-images/a.jpeg')).toBe(false);
  });

  it('rejects a URL with no extension at all', () => {
    expect(isPdfFile('https://ik.imagekit.io/x/protocol-files/a')).toBe(false);
  });

  it('rejects an empty URL', () => {
    expect(isPdfFile('')).toBe(false);
  });

  it('rejects a missing URL', () => {
    expect(isPdfFile(null)).toBe(false);
    expect(isPdfFile(undefined)).toBe(false);
  });
});
