/**
 * Trigger a client-side download of CSV text as a file. Kept as a tiny, isolated
 * side-effect helper so the pure CSV builders stay DOM-free and testable. The
 * BOM prefix makes Excel open UTF-8 content (e.g. peso signs, accented names)
 * correctly instead of mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
