/**
 * Minimal RFC-4180-style CSV parser.
 *
 * Handles:
 * - Quoted fields containing commas, newlines, and escaped quotes ("")
 * - CRLF and LF line endings
 * - A UTF-8 BOM
 * - Short rows (padded with empty values so trailing empty columns don't drop data)
 * - Empty rows (skipped)
 */
export function parseCSV(text: string): Record<string, string>[] {
  const normalized = text.replace(/^\uFEFF/, '');
  const headers: string[] = [];
  const records: Record<string, string>[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let rowIndex = 0;

  const flushField = () => {
    row.push(field);
    field = '';
  };

  const flushRow = () => {
    if (rowIndex === 0) {
      headers.push(...row.map((h) => h.trim()));
    } else if (row.some((v) => v.trim() !== '')) {
      // Pad short rows so rows without trailing empty columns are not dropped
      while (row.length < headers.length) row.push('');
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = (row[idx] || '').trim();
      });
      records.push(record);
    }
    row = [];
    rowIndex++;
  };

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      flushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && normalized[i + 1] === '\n') i++;
      flushField();
      flushRow();
    } else {
      field += ch;
    }
  }

  // Flush any remaining row when the file does not end with a newline
  if (field !== '' || row.length > 0) {
    flushField();
    flushRow();
  }

  return records;
}
