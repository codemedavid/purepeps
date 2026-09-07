// URL rules for the files an admin attaches to a protocol or a lab report.
// Kept apart from the viewers so they stay unit-testable.

function extensionOf(url: string): string {
  const path = url.split('?')[0];
  const fileName = path.split('/').pop() ?? '';
  if (!fileName.includes('.')) return '';
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * True when the URL points at a PDF, ignoring any query string after it.
 * PDFs are the only attachment the in-site viewer can rasterise; anything else
 * gets an explanatory panel rather than a link out to the file host.
 */
export function isPdfFile(url?: string | null): boolean {
  return !!url && extensionOf(url) === 'pdf';
}
