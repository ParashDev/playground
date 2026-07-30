export type ColumnType = "INTEGER" | "REAL" | "TEXT";
export type CellValue = string | number | null;

export interface ImportedTable {
  name: string;
  columns: { name: string; type: ColumnType }[];
  rows: CellValue[][];
}

const INTEGER_PATTERN = /^-?\d{1,15}$/;
const REAL_PATTERN = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * Turns an arbitrary string into a usable SQLite identifier. Quoting would
 * technically allow anything, but plain identifiers keep the generated SQL
 * readable for people who then edit it by hand.
 */
function sanitizeIdentifier(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return fallback;
  return /^\d/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Appends _2, _3 … so a duplicate header cannot collide. */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const lower = name.toLowerCase();
    const count = seen.get(lower) ?? 0;
    seen.set(lower, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

/** Picks whichever of , ; tab | appears most often outside quotes. */
function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/** RFC 4180 style: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(input: string, delimiter?: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const firstBreak = text.indexOf("\n");
  const sep = delimiter ?? detectDelimiter(text.slice(0, firstBreak === -1 ? 2000 : firstBreak));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
      started = true;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
    } else if (ch !== "\r") {
      field += ch;
      started = true;
    }
  }

  if (started || field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

function inferType(values: string[]): ColumnType {
  let sawValue = false;
  let allInteger = true;
  let allReal = true;

  for (const value of values) {
    if (value === "") continue;
    sawValue = true;
    if (!INTEGER_PATTERN.test(value)) allInteger = false;
    if (!REAL_PATTERN.test(value)) allReal = false;
    if (!allInteger && !allReal) break;
  }

  if (!sawValue) return "TEXT";
  if (allInteger) return "INTEGER";
  if (allReal) return "REAL";
  return "TEXT";
}

function coerce(value: string, type: ColumnType): CellValue {
  if (value === "") return null;
  if (type === "INTEGER") return Number.parseInt(value, 10);
  if (type === "REAL") return Number.parseFloat(value);
  return value;
}

export function csvToTable(fileName: string, text: string): ImportedTable {
  const grid = parseCsv(text);
  if (grid.length === 0) throw new Error("That file has no rows.");

  const [headerRow, ...dataRows] = grid;
  const headers = uniqueNames(
    headerRow.map((header, i) => sanitizeIdentifier(header, `column_${i + 1}`)),
  );

  const columns = headers.map((name, index) => ({
    name,
    type: inferType(dataRows.map((row) => (row[index] ?? "").trim())),
  }));

  const rows = dataRows.map((row) =>
    columns.map((column, index) => coerce((row[index] ?? "").trim(), column.type)),
  );

  return { name: sanitizeIdentifier(fileName, "imported_table"), columns, rows };
}

export function jsonToTable(fileName: string, text: string): ImportedTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`That file is not valid JSON: ${(error as Error).message}`);
  }

  // A bare object is also accepted when one of its values is the array — the
  // shape most APIs return, e.g. { "results": [ … ] }.
  let records: unknown[] | null = Array.isArray(parsed) ? parsed : null;
  if (!records && parsed && typeof parsed === "object") {
    const arrayValue = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    if (arrayValue) records = arrayValue as unknown[];
  }
  if (!records || records.length === 0) {
    throw new Error("Expected a JSON array of objects, or an object containing one.");
  }

  const keys: string[] = [];
  for (const record of records) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      for (const key of Object.keys(record)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
  }
  if (keys.length === 0) throw new Error("Expected a JSON array of objects.");

  const columnNames = uniqueNames(keys.map((key, i) => sanitizeIdentifier(key, `column_${i + 1}`)));

  // Every value is stringified first so type inference runs on exactly the same
  // representation the CSV path uses. Nested values become JSON text.
  const asText = records.map((record) =>
    keys.map((key) => {
      const value = (record as Record<string, unknown>)?.[key];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }),
  );

  const columns = columnNames.map((name, index) => ({
    name,
    type: inferType(asText.map((row) => row[index])),
  }));

  const rows = asText.map((row) => columns.map((column, i) => coerce(row[i], column.type)));

  return { name: sanitizeIdentifier(fileName, "imported_table"), columns, rows };
}
