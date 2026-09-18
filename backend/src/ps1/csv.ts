export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const input = text.replace(/^\uFEFF/, "");
  const endField = () => { row.push(field.trim()); field = ""; closed = false; };
  const endRow = () => { endField(); if (row.some((v) => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') { if (input[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === '"') {
      if (field.trim() || closed) throw new Error("CSV: unexpected quote");
      field = ""; quoted = true;
    } else if (c === ",") endField();
    else if (c === "\n" || c === "\r") { if (c === "\r" && input[i + 1] === "\n") i++; endRow(); }
    else { if (closed && c.trim()) throw new Error("CSV: characters after closing quote"); if (!closed) field += c; }
  }
  if (quoted) throw new Error("CSV: unterminated quoted field");
  endRow();
  if (!rows.length) throw new Error("CSV: empty file");
  const header = rows.shift()!;
  if (header.some((v) => !v) || new Set(header).size !== header.length) throw new Error("CSV: empty or duplicate header");
  return rows.map((values, i) => {
    if (values.length !== header.length) throw new Error(`CSV row ${i + 2}: expected ${header.length} columns, got ${values.length}`);
    return Object.fromEntries(header.map((h, j) => [h, values[j]]));
  });
}
export function writeCsv(headers: string[], rows: object[]): string {
  const escape = (value: unknown) => { const str = String(value ?? ""); return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str; };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape((row as Record<string, unknown>)[h])).join(","))].join("\r\n") + "\r\n";
}
