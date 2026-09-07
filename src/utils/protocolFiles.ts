// Helpers for the protocol files an admin attaches to a protocol. Kept apart
// from the viewer so the URL rules stay unit-testable.

const IMAGEKIT_HOST = 'ik.imagekit.io';
const ATTACHMENT_FLAG = 'ik-attachment=true';

function extensionOf(url: string): string {
  const path = url.split('?')[0];
  const fileName = path.split('/').pop() ?? '';
  if (!fileName.includes('.')) return '';
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

/** True when the URL points at a PDF, ignoring any query string after it. */
export function isPdfFile(url?: string | null): boolean {
  return !!url && extensionOf(url) === 'pdf';
}

/** File types the in-site viewer can draw. Everything else gets a download. */
export function isPreviewableFile(url: string): boolean {
  return isPdfFile(url);
}

/**
 * Browsers ignore the `download` attribute across origins, so a plain link to
 * an ImageKit asset navigates away instead of saving. `ik-attachment=true`
 * makes ImageKit answer with `Content-Disposition: attachment`, which keeps the
 * customer on the page and still hands them the file.
 */
export function toDownloadUrl(url: string): string {
  if (!url.includes(IMAGEKIT_HOST) || url.includes(ATTACHMENT_FLAG)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${ATTACHMENT_FLAG}`;
}
