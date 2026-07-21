/**
 * Minimal RFC-4180 CSV serializer — pure, framework-free, no dependency. A field is quoted iff it
 * contains a comma, double-quote, or newline; embedded double-quotes are doubled. This matters
 * directly here: dual dates render as `2026-07-20 (৫ Srabon, ১৪৩৩)` — the comma inside the
 * parentheses would corrupt every downstream column without proper quoting.
 */
export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  const text = String(cell);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(header: readonly string[], rows: readonly CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(','));
  // Trailing newline — POSIX-friendly and what spreadsheet tools expect on the final record.
  return lines.join('\r\n') + '\r\n';
}
