import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Project } from "../storage/db";

export interface ProjectsTreeProps {
  projects: Project[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Rendered under the open project — its tables, files and saved code. */
  children: ReactNode;
}

/**
 * The sidebar's root. Only the open project expands, because the SQLite engine
 * holds exactly one database at a time — showing tables under a closed project
 * would mean inventing data we have not loaded. Clicking a collapsed project
 * therefore opens it.
 */
export function ProjectsTree({
  projects,
  currentId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  children,
}: ProjectsTreeProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const commitCreate = () => {
    const name = draftName.trim();
    if (name) onCreate(name);
    setDraftName("");
    setCreating(false);
  };

  const commitRename = (id: string) => {
    const name = renameDraft.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase dark:border-line-dark dark:text-muted-dark">
        Projects
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="New project"
          aria-label="New project"
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium normal-case hover:bg-canvas hover:text-accent dark:hover:bg-canvas-dark"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {creating && (
          <div className="flex items-center gap-1 px-2 pb-1">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitCreate();
                if (event.key === "Escape") setCreating(false);
              }}
              placeholder="Project name"
              autoFocus
              className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 text-[12px] outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
            <button
              type="button"
              onClick={commitCreate}
              aria-label="Create project"
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

        {projects.map((project) => {
          const isOpen = project.id === currentId;
          const isRenaming = renamingId === project.id;

          return (
            <div key={project.id}>
              {isRenaming ? (
                <div className="flex items-center gap-1 px-2 py-0.5">
                  <input
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(project.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-line bg-canvas px-2 py-1 text-[12px] outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
                  />
                  <button
                    type="button"
                    onClick={() => commitRename(project.id)}
                    aria-label="Confirm rename"
                    className="flex-shrink-0 rounded p-1 text-accent hover:bg-canvas dark:hover:bg-canvas-dark"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    aria-label="Cancel rename"
                    className="flex-shrink-0 rounded p-1 text-muted hover:bg-canvas dark:text-muted-dark dark:hover:bg-canvas-dark"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="group flex items-center gap-0.5 px-2">
                  <button
                    type="button"
                    onClick={() => onSelect(project.id)}
                    aria-expanded={isOpen}
                    title={isOpen ? project.name : `Open ${project.name}`}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1.5 text-left hover:bg-canvas dark:hover:bg-canvas-dark"
                  >
                    <ChevronRight
                      size={12}
                      className={`flex-shrink-0 text-muted transition-transform dark:text-muted-dark ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[12.5px] ${
                        isOpen ? "font-semibold" : ""
                      }`}
                    >
                      {project.name}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(project.id);
                      setRenameDraft(project.name);
                    }}
                    aria-label={`Rename ${project.name}`}
                    title="Rename"
                    className="flex-shrink-0 rounded p-1 text-muted opacity-100 hover:bg-canvas hover:text-ink md:opacity-0 md:group-hover:opacity-100 dark:text-muted-dark dark:hover:bg-canvas-dark"
                  >
                    <Pencil size={11} />
                  </button>

                  {confirmingId === project.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(project.id);
                          setConfirmingId(null);
                        }}
                        aria-label={`Confirm delete ${project.name}`}
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
                      onClick={() => setConfirmingId(project.id)}
                      disabled={projects.length === 1}
                      aria-label={`Delete ${project.name}`}
                      title={projects.length === 1 ? "The last project cannot be deleted" : "Delete"}
                      className="flex-shrink-0 rounded p-1 text-muted opacity-100 hover:bg-canvas hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-25 md:opacity-0 md:group-hover:opacity-100 dark:text-muted-dark dark:hover:bg-canvas-dark"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )}

              {isOpen && (
                <div className="mb-2 ml-4 border-l border-line pl-1 dark:border-line-dark">
                  {children}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
