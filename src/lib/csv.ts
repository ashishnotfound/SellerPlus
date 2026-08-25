/** Protects spreadsheet users from formula injection and emits RFC-style CSV. */
export function escapeCsvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function createCsv(headers: readonly unknown[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}
