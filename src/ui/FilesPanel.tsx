import { useRef, useState } from "react";
import { Check, Download, FileCode2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { LanguageId } from "../engines/types";
import type { ProjectFile } from "../storage/db";

/** Default extension for a new file in each mode. */
export const EXTENSION: Record<LanguageId, string> = {
  sql: "sql",
  web: "html",
  javascript: "js",
  typescript: "ts",
};

const ACCEPT: Record<LanguageId, string> = {
  sql: ".sql,.txt,text/plain",
  web: ".html,.htm,.css,.js,.mjs,.txt,text/plain",
  javascript: ".js,.mjs,.cjs,.jsx,.txt,text/plain",
  typescript: ".ts,.tsx,.mts,.txt,text/plain",
};

export interface FilesPanelProps {
  language: LanguageId;
  files: ProjectFile[];
  activeId: string | null;
  onOpen: (file: ProjectFile) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onImport: (file: File) => void;
  onDownload: (file: ProjectFile) => void;
}

export function FilesPanel({
  language,
  files,
  activeId,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onImport,
  onDownload,
}: FilesPanelProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const extension = EXTENSION[language];

  const beginCreate = () => {
    // Pre-fill with the next free default name so Enter alone is enough.
    const taken = new Set(files.map((f) => f.name.toLowerCase()));
    const base = language === "sql" ? "query" : "script";
    let candidate = `${base}.${extension}`;
    let counter = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base}-${counter}.${extension}`;
      counter++;
    }
    setDraftName(candidate);
    setCreating(true);
  };

  const commitCreate = () => {
    const name = draftName.trim();
    if (name) onCreate(name);
    setCreating(false);
  };

  const commitRename = (id: string) => {
    const name = renameDraft.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  };

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
        const dropped = event.dataTransfer.files?.[0];
        if (dropped) onImport(dropped);
      }}
    >
      <div className="flex flex-shrink-0 items-center gap-1 px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase dark:text-muted-dark">
        <FileCode2 size={12} />
        Files
        <button
          type="button"
          onClick={beginCreate}
          title={`New .${extension} file`}
          aria-label="New file"
          className="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium normal-case hover:bg-canvas hover:text-accent dark:hover:bg-canvas-dark"
        >
          <Plus size={12} />
          New
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={`Open a .${extension} file from disk`}
          aria-label="Import file"
          className="rounded p-1 hover:bg-canvas hover:text-accent dark:hover:bg-canvas-dark"
        >
          <Upload size={11} />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[language]}
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) onImport(picked);
          // Cleared so picking the same file twice still fires a change event.
          event.target.value = "";
        }}
      />

      <div className="pb-2">
        {creating && (
          <div className="flex items-center gap-1 px-2 pb-1">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitCreate();
                if (event.key === "Escape") setCreating(false);
              }}
              autoFocus
              className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 font-mono text-[11.5px] outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
            <button
              type="button"
              onClick={commitCreate}
              aria-label="Create file"
              className="flex-shrink-0 rounded p-1 text-accent hover:bg-canvas dark:hover:bg-canvas-dark"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cancel"
              className="flex-shrink-0 rounded p-1 text-muted hover:bg-canvas dark:text-muted-dark dark:hover:bg-canvas-dark"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {files.length === 0 && !creating && (
          <p className="px-3 pb-2 text-[11.5px] leading-relaxed text-muted dark:text-muted-dark">
            No files yet — press New.
          </p>
        )}

        {files.map((file) => {
          const isActive = file.id === activeId;
          const isRenaming = renamingId === file.id;

          if (isRenaming) {
            return (
              <div key={file.id} className="flex items-center gap-1 px-2 py-0.5">
                <input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename(file.id);
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 font-mono text-[11.5px] outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
                />
                <button
                  type="button"
                  onClick={() => commitRename(file.id)}
                  aria-label="Confirm rename"
                  className="flex-shrink-0 rounded p-1 text-accent hover:bg-canvas dark:hover:bg-canvas-dark"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  aria-label="Cancel rename"
                  className="flex-shrink-0 rounded p-1 text-muted hover:bg-canvas dark:text-muted-dark dark:hover:bg-canvas-dark"
                >
                  <X size={12} />
                </button>
              </div>
            );
          }

          return (
            <div key={file.id} className="group flex items-center gap-0.5 px-2">
              <button
                type="button"
                onClick={() => onOpen(file)}
                title={file.name}
                className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left font-mono text-[11.5px] hover:bg-canvas dark:hover:bg-canvas-dark ${
                  isActive ? "bg-canvas font-semibold text-accent dark:bg-canvas-dark" : ""
                }`}
              >
                {file.name}
              </button>

              <button
                type="button"
                onClick={() => onDownload(file)}
                aria-label={`Download ${file.name}`}
                title={`Download ${file.name}`}
                className="flex-shrink-0 rounded p-1 text-muted opacity-100 hover:bg-canvas hover:text-accent md:opacity-0 md:group-hover:opacity-100 dark:text-muted-dark dark:hover:bg-canvas-dark"
              >
                <Download size={11} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setRenamingId(file.id);
                  setRenameDraft(file.name);
                }}
                aria-label={`Rename ${file.name}`}
                title="Rename"
                className="flex-shrink-0 rounded p-1 text-muted opacity-100 hover:bg-canvas hover:text-ink md:opacity-0 md:group-hover:opacity-100 dark:text-muted-dark dark:hover:bg-canvas-dark"
              >
                <Pencil size={11} />
              </button>

              {confirmingId === file.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(file.id);
                      setConfirmingId(null);
                    }}
                    aria-label={`Confirm delete ${file.name}`}
                    title="Confirm delete"
                    className="flex-shrink-0 rounded p-1 text-red-500 hover:bg-canvas dark:hover:bg-canvas-dark"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    aria-label="Cancel delete"
                    className="flex-shrink-0 rounded p-1 text-muted hover:bg-canvas dark:text-muted-dark dark:hover:bg-canvas-dark"
                  >
                    <X size={11} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(file.id)}
                  disabled={files.length === 1}
                  aria-label={`Delete ${file.name}`}
                  title={files.length === 1 ? "The last file cannot be deleted" : "Delete"}
                  className="flex-shrink-0 rounded p-1 text-muted opacity-100 hover:bg-canvas hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-25 md:opacity-0 md:group-hover:opacity-100 dark:text-muted-dark dark:hover:bg-canvas-dark"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
