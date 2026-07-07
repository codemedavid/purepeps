/**
 * Shared, side-effect-free CSV primitives used by the group-buy exports. RFC-4180
 * quoting: wrap a cell when it holds a comma, quote, or newline, doubling any inner
 * quotes. Kept tiny and dependency-free so every builder produces spreadsheet-safe
 * output (Excel / Google Sheets / plain CSV) the same way.
 */

export type Cell = string | number | null | undefined;

export function csvCell(value: Cell): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(cells: Cell[]): string {
  return cells.map(csvCell).join(',');
}

/** Two-decimal plain number (no currency symbol) so the CSV stays spreadsheet-friendly. */
export function money(value: number): string {
  return value.toFixed(2);
}
