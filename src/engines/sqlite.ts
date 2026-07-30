import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import {
  MAX_ROWS,
  type Engine,
  type RunOutput,
  type RunResult,
  type SchemaColumn,
  type SchemaTable,
} from "./types";

/**
 * The SQLite binary is loaded from jsDelivr rather than bundled, so the deploy
 * contains no .wasm file at all — one less thing for a host to serve with the
 * right content type, and 323 KB of gzipped traffic we do not pay for.
 *
 * IMPORTANT: this version must match the `sql.js` version in package.json. The
 * JavaScript glue is bundled from node_modules while the binary comes from
 * here, and the two are a matched pair — a mismatch fails at instantiation.
 */
const SQLJS_VERSION = "1.14.1";
const SQLJS_CDN = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/`;

let runtime: SqlJsStatic | null = null;

/** Fetched once per page load and shared by every reset. */
async function getRuntime(): Promise<SqlJsStatic> {
  if (!runtime) {
    runtime = await initSqlJs({ locateFile: (file) => `${SQLJS_CDN}${file}` });
  }
  return runtime;
}

/**
 * SQLite compiled to WebAssembly, running in-memory.
 *
 * This deliberately runs on the main thread. Queries against the sample
 * databases finish in well under a frame, and keeping it here avoids the
 * worker/CJS-interop complexity for now. The Engine interface is fully async,
 * so moving it into a Worker later is an internal change with no callers
 * affected.
 */
export class SqliteEngine implements Engine {
  readonly id = "sql" as const;
  readonly monacoLanguage = "sql";

  private db: Database | null = null;
  private seed: string;

  /** @param seed SQL run on every fresh database, e.g. the sample dataset. */
  constructor(seed = "") {
    this.seed = seed;
  }

  async init(): Promise<void> {
    if (this.db) return;
    const SQL = await getRuntime();
    this.db = new SQL.Database();
    if (this.seed.trim()) {
      this.db.run(this.seed);
    }
  }

  setSeed(seed: string): void {
    this.seed = seed;
  }

  /** Replaces the live database with a SQLite file — a saved project, or one
   *  the user picked off disk. */
  async loadBytes(bytes: Uint8Array): Promise<void> {
    const SQL = await getRuntime();
    this.db?.close();
    this.db = new SQL.Database(bytes);
  }

  /** The database as a real .sqlite file, for persistence or download. */
  async exportBytes(): Promise<Uint8Array> {
    await this.init();
    return this.db!.export();
  }

  /** Starts an empty database with no seed applied. */
  async loadEmpty(): Promise<void> {
    const SQL = await getRuntime();
    this.db?.close();
    this.db = new SQL.Database();
  }

  /**
   * Creates a table from imported rows. Values are bound through a prepared
   * statement rather than interpolated into SQL text, which sidesteps quoting
   * bugs entirely and is dramatically faster on large files.
   */
  async createTable(
    name: string,
    columns: { name: string; type: string }[],
    rows: (string | number | null)[][],
  ): Promise<void> {
    await this.init();
    const db = this.db!;
    const quoted = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

    db.run(`DROP TABLE IF EXISTS ${quoted(name)}`);
    db.run(
      `CREATE TABLE ${quoted(name)} (${columns
        .map((column) => `${quoted(column.name)} ${column.type}`)
        .join(", ")})`,
    );

    if (rows.length === 0) return;

    const placeholders = columns.map(() => "?").join(", ");
    const statement = db.prepare(`INSERT INTO ${quoted(name)} VALUES (${placeholders})`);
    try {
      db.run("BEGIN TRANSACTION");
      for (const row of rows) {
        statement.run(row as (string | number | null)[]);
      }
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    } finally {
      statement.free();
    }
  }

  async run(source: string): Promise<RunResult> {
    await this.init();
    const db = this.db;
    if (!db) throw new Error("Database failed to initialise");

    const started = performance.now();
    const outputs: RunOutput[] = [];

    try {
      // `iterateStatements` keeps each statement separate, so a five-statement
      // script produces five labelled results instead of one merged blob.
      for (const statement of db.iterateStatements(source)) {
        const sql = statement.getSQL().trim();
        const columns = statement.getColumnNames();

        if (columns.length > 0) {
          const rows: unknown[][] = [];
          let truncated = false;
          while (statement.step()) {
            if (rows.length >= MAX_ROWS) {
              truncated = true;
              break;
            }
            rows.push(statement.get());
          }
          outputs.push({ kind: "table", label: sql, columns, rows, truncated });
        } else {
          // No columns means a write: report what it changed instead of an
          // empty grid.
          statement.step();
          const changes = db.getRowsModified();
          outputs.push({
            kind: "notice",
            text:
              changes > 0
                ? `${changes} row${changes === 1 ? "" : "s"} affected`
                : "Statement executed",
          });
        }
        statement.free();
      }

      if (outputs.length === 0) {
        outputs.push({ kind: "notice", text: "Nothing to run" });
      }
    } catch (error) {
      outputs.push({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return { outputs, durationMs: performance.now() - started };
  }

  async getSchema(): Promise<SchemaTable[]> {
    await this.init();
    const db = this.db;
    if (!db) return [];

    const tables: SchemaTable[] = [];
    const listing = db.exec(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    );
    if (listing.length === 0) return [];

    for (const [name, type] of listing[0].values as [string, string][]) {
      const columns: SchemaColumn[] = [];
      // PRAGMA can't be parameterised, and the name comes from sqlite_master
      // rather than user input, so quoting it is sufficient.
      const info = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
      if (info.length > 0) {
        for (const row of info[0].values) {
          columns.push({
            name: String(row[1]),
            type: String(row[2] || ""),
            notNull: row[3] === 1,
            primaryKey: Number(row[5]) > 0,
          });
        }
      }

      let rowCount: number | null = null;
      try {
        const count = db.exec(`SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`);
        rowCount = count.length > 0 ? Number(count[0].values[0][0]) : null;
      } catch {
        // Views can fail to count if they reference a missing table; the
        // sidebar just omits the number in that case.
        rowCount = null;
      }

      tables.push({ name, kind: type === "view" ? "view" : "table", columns, rowCount });
    }

    return tables;
  }

  async reset(): Promise<void> {
    this.db?.close();
    this.db = null;
    await this.init();
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
  }
}
