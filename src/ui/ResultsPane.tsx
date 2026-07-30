import { AlertCircle, Info, Terminal } from "lucide-react";
import type { RunOutput, TableOutput } from "../engines/types";

function cellText(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (value instanceof Uint8Array) return `BLOB (${value.length} bytes)`;
  return String(value);
}

function ResultTable({ output }: { output: TableOutput }) {
  return (
    <div className="min-w-0">
      {output.label && (
        <div className="truncate px-3 pt-3 pb-2 font-mono text-[11px] text-muted dark:text-muted-dark">
          {output.label}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {output.columns.map((column, i) => (
                <th
                  key={`${column}-${i}`}
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-line bg-surface px-3 py-2 text-left font-medium text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {output.rows.map((row, r) => (
              <tr key={r} className="hover:bg-surface dark:hover:bg-surface-dark">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    // Cells wrap rather than truncate so long values are fully
                    // readable; the max width stops one blob from stretching
                    // the grid past the pane.
                    className={`max-w-[32rem] border-b border-line px-3 py-1.5 align-top break-words whitespace-pre-wrap dark:border-line-dark ${
                      cell === null ? "text-muted italic dark:text-muted-dark" : ""
                    }`}
                  >
                    {cellText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 text-[11px] text-muted dark:text-muted-dark">
        {output.rows.length} row{output.rows.length === 1 ? "" : "s"}
        {output.truncated && " — truncated"}
      </div>
    </div>
  );
}

const LOG_TONE = {
  log: "text-ink dark:text-ink-dark",
  info: "text-sky-700 dark:text-sky-400",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
} as const;

export interface ResultsPaneProps {
  outputs: RunOutput[];
  running: boolean;
  durationMs: number | null;
  hasRun: boolean;
  /** "Results" for SQL result sets, "Console" for JS/TS output. */
  title: string;
}

export function ResultsPane({ outputs, running, durationMs, hasRun, title }: ResultsPaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas dark:bg-canvas-dark">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2 dark:border-line-dark">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted uppercase dark:text-muted-dark">
          <Terminal size={12} />
          {title}
        </div>

        {durationMs !== null && !running && (
          <span className="flex-shrink-0 font-mono text-[11px] text-muted dark:text-muted-dark">
            {durationMs < 1 ? "<1" : Math.round(durationMs)} ms
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!hasRun && !running && (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm text-muted dark:text-muted-dark">
              Press{" "}
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] dark:border-line-dark">
                Ctrl
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] dark:border-line-dark">
                Enter
              </kbd>{" "}
              to run
            </p>
          </div>
        )}

        {running && (
          <div className="px-3 py-3 text-sm text-muted dark:text-muted-dark">Running…</div>
        )}

        {!running &&
          outputs.map((output, i) => {
            if (output.kind === "table") return <ResultTable key={i} output={output} />;

            if (output.kind === "error") {
              return (
                <div
                  key={i}
                  className="flex gap-2 border-b border-line px-3 py-2.5 dark:border-line-dark"
                >
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
                  <pre className="min-w-0 flex-1 font-mono text-[12.5px] whitespace-pre-wrap text-red-600 dark:text-red-400">
                    {output.message}
                  </pre>
                </div>
              );
            }

            if (output.kind === "notice") {
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-[12.5px] text-muted dark:border-line-dark dark:text-muted-dark"
                >
                  <Info size={13} className="flex-shrink-0" />
                  {output.text}
                </div>
              );
            }

            return (
              <div
                key={i}
                className="border-b border-line px-3 py-1.5 dark:border-line-dark"
              >
                <pre
                  className={`font-mono text-[12.5px] whitespace-pre-wrap ${LOG_TONE[output.level]}`}
                >
                  {output.parts.join(" ")}
                </pre>
              </div>
            );
          })}
      </div>
    </div>
  );
}
