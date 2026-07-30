import { useRef, useState } from "react";
import { ChevronRight, Database, Download, Eye, KeyRound, Table2, Upload } from "lucide-react";
import type { SchemaTable } from "../engines/types";

export interface SchemaPanelProps {
  tables: SchemaTable[];
  /** Loads a starter query for the table into the editor and runs it. */
  onSelectTable: (tableName: string) => void;
  /** A .csv, .json, .sqlite or .db file the user picked or dropped. */
  onImportFile: (file: File) => void;
  /** Saves the whole project database out as a .sqlite file. */
  onDownload: () => void;
}

const ACCEPTED = ".csv,.tsv,.json,.sqlite,.sqlite3,.db,text/csv,application/json";

export function SchemaPanel({
  tables,
  onSelectTable,
  onImportFile,
  onDownload,
}: SchemaPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (name: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <section
      className={`flex flex-col ${dragging ? "bg-accent/10 ring-1 ring-accent ring-inset" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onImportFile(file);
      }}
    >
      <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase dark:text-muted-dark">
        <Database size={12} />
        Tables
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Import a CSV, JSON or .sqlite file"
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted normal-case hover:bg-canvas hover:text-accent dark:text-muted-dark dark:hover:bg-canvas-dark"
        >
          <Upload size={11} />
          Import
        </button>
        {tables.length > 0 && (
          <button
            type="button"
            onClick={onDownload}
            title="Download this database as a .sqlite file"
            aria-label="Download database"
            className="rounded p-1 text-muted hover:bg-canvas hover:text-accent dark:text-muted-dark dark:hover:bg-canvas-dark"
          >
            <Download size={12} />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportFile(file);
          // Cleared so picking the same file twice still fires a change event.
          event.target.value = "";
        }}
      />

      <div className="pb-2">
        {tables.length === 0 && (
          <div className="px-3 pb-3 text-[12px] leading-relaxed text-muted dark:text-muted-dark">
            <p className="mb-2">No tables yet — two ways to add one:</p>
            <p className="mb-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-medium text-accent hover:underline"
              >
                Import a file
              </button>{" "}
              — CSV, JSON, or an existing .sqlite database. Dropping one here works too.
            </p>
            <p>
              Or run <code className="font-mono text-[11px]">CREATE TABLE …</code> in the editor.
            </p>
          </div>
        )}

        {tables.map((table) => {
          const isOpen = expanded.has(table.name);
          return (
            <div key={table.name}>
              <div className="flex items-center gap-0.5 px-2 py-0.5">
                <button
                  type="button"
                  onClick={() => toggle(table.name)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${table.name}`}
                  className="flex-shrink-0 rounded p-1 text-muted hover:bg-canvas dark:text-muted-dark dark:hover:bg-canvas-dark"
                >
                  <ChevronRight
                    size={12}
                    className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTable(table.name)}
                  title={`Query ${table.name}`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-canvas dark:hover:bg-canvas-dark"
                >
                  {table.kind === "view" ? (
                    <Eye size={12} className="flex-shrink-0 text-muted dark:text-muted-dark" />
                  ) : (
                    <Table2 size={12} className="flex-shrink-0 text-accent" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                    {table.name}
                  </span>
                  {table.rowCount !== null && (
                    <span className="flex-shrink-0 pl-1 font-mono text-[10px] text-muted dark:text-muted-dark">
                      {table.rowCount}
                    </span>
                  )}
                </button>
              </div>

              {isOpen && (
                <ul className="mb-1 ml-5 border-l border-line pr-2 pl-2 dark:border-line-dark">
                  {table.columns.map((column) => (
                    <li
                      key={column.name}
                      className="flex min-w-0 items-center gap-1.5 py-0.5 font-mono text-[11px]"
                    >
                      {column.primaryKey && (
                        <KeyRound size={9} className="flex-shrink-0 text-amber-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate" title={column.name}>
                        {column.name}
                      </span>
                      <span className="flex-shrink-0 pl-1 text-[10px] text-muted dark:text-muted-dark">
                        {column.type || "ANY"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
