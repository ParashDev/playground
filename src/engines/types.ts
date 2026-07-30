/**
 * A mode, not strictly a language: `web` bundles the HTML, CSS and JS files of
 * a project into one document and runs that.
 */
export type LanguageId = "sql" | "web" | "javascript" | "typescript";

/** A result grid — SQLite SELECTs and console.table both produce these. */
export interface TableOutput {
  kind: "table";
  /** Statement or expression that produced the grid, shown above it. */
  label?: string;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

export interface LogOutput {
  kind: "log";
  level: "log" | "info" | "warn" | "error";
  parts: string[];
}

export interface NoticeOutput {
  kind: "notice";
  text: string;
}

export interface ErrorOutput {
  kind: "error";
  message: string;
}

export type RunOutput = TableOutput | LogOutput | NoticeOutput | ErrorOutput;

export interface RunResult {
  outputs: RunOutput[];
  durationMs: number;
  /** True when the run left something on the page — i.e. there is a preview
   *  worth showing. Only JavaScript/TypeScript engines set this. */
  rendered?: boolean;
}

/** A column of a live SQLite table, for the schema sidebar. */
export interface SchemaColumn {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
}

export interface SchemaTable {
  name: string;
  kind: "table" | "view";
  columns: SchemaColumn[];
  rowCount: number | null;
}

/**
 * Every language backend implements this. The shell only ever talks to an
 * Engine, so adding PGlite, DuckDB, or Pyodide later is a new file here plus a
 * registry entry — nothing in the UI changes.
 */
export interface Engine {
  readonly id: LanguageId;
  /** Monaco language id. */
  readonly monacoLanguage: string;
  /** Called once before the first run. Safe to call repeatedly. */
  init(): Promise<void>;
  run(source: string): Promise<RunResult>;
  /** Only SQL engines expose a schema; others return null. */
  getSchema?(): Promise<SchemaTable[]>;
  /** Discard all state and start over (drops the in-memory database). */
  reset(): Promise<void>;
  dispose(): void;
}

/** Rows past this are dropped so a `SELECT *` on a big table can't lock the UI. */
export const MAX_ROWS = 5000;
