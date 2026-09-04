import { describe, it, expect } from 'vitest';
import { isPreviewableFile, toDownloadUrl } from './protocolFiles';

describe('isPreviewableFile', () => {
  it('treats a PDF as previewable', () => {
    expect(isPreviewableFile('https://ik.imagekit.io/x/protocol-files/a.pdf')).toBe(true);
  });

  it('ignores letter case in the extension', () => {
    expect(isPreviewableFile('https://ik.imagekit.io/x/protocol-files/a.PDF')).toBe(true);
  });

  it('ignores a query string after the extension', () => {
    expect(isPreviewableFile('https://ik.imagekit.io/x/a.pdf?updatedAt=1712345')).toBe(true);
  });

  it('rejects an office document the browser cannot draw', () => {
    expect(isPreviewableFile('https://ik.imagekit.io/x/protocol-files/a.docx')).toBe(false);
  });

  it('rejects a URL with no extension at all', () => {
    expect(isPreviewableFile('https://ik.imagekit.io/x/protocol-files/a')).toBe(false);
  });

  it('rejects an empty URL', () => {
    expect(isPreviewableFile('')).toBe(false);
  });
});

describe('toDownloadUrl', () => {
  // Browsers ignore the `download` attribute across origins, so an ImageKit
  // asset only saves instead of navigating when ImageKit itself sends
  // Content-Disposition: attachment.
  it('asks ImageKit for an attachment response', () => {
    expect(toDownloadUrl('https://ik.imagekit.io/x/a.pdf')).toBe(
      'https://ik.imagekit.io/x/a.pdf?ik-attachment=true',
    );
  });

  it('appends to an existing query string', () => {
    expect(toDownloadUrl('https://ik.imagekit.io/x/a.pdf?updatedAt=17')).toBe(
      'https://ik.imagekit.io/x/a.pdf?updatedAt=17&ik-attachment=true',
    );
  });

  it('does not add the flag twice', () => {
    const already = 'https://ik.imagekit.io/x/a.pdf?ik-attachment=true';
    expect(toDownloadUrl(already)).toBe(already);
  });

  it('leaves a non-ImageKit URL untouched', () => {
    const other = 'https://test.supabase.co/storage/v1/object/public/protocol-files/a.pdf';
    expect(toDownloadUrl(other)).toBe(other);
  });
});
