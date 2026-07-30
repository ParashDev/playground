import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MonitorPlay,
  Moon,
  PanelLeft,
  Play,
  RotateCcw,
  Sun,
  Trash2,
} from "lucide-react";
import { CodeEditor } from "../editor/CodeEditor";
import { JavaScriptEngine, type Transpiler } from "../engines/javascript";
import { SANDBOX_BOOTSTRAP } from "../engines/sandbox-bootstrap";
import { SqliteEngine } from "../engines/sqlite";
import { WebEngine } from "../engines/web";
import type { LanguageId, RunOutput, SchemaTable } from "../engines/types";
import {
  BLANK_FILES,
  NEW_PROJECT_SNIPPETS,
  SAMPLE_DATABASE,
  STARTER_FILES,
  STARTER_SNIPPETS,
  type FileBlueprint,
} from "../data/samples";
import { csvToTable, jsonToTable } from "../data/import";
import { assembleWebDocument } from "../data/web-bundle";
import {
  clearAll,
  createFile,
  createProject,
  deleteFile,
  deleteProject,
  listFiles,
  listProjects,
  loadDatabaseBytes,
  renameFile,
  renameProject,
  saveDatabaseBytes,
  touchProject,
  updateFileSource,
  type Project,
  type ProjectFile,
} from "../storage/db";
import { EXTENSION, FilesPanel } from "../ui/FilesPanel";
import { ProjectsTree } from "../ui/ProjectsTree";
import { ResultsPane } from "../ui/ResultsPane";
import { SchemaPanel } from "../ui/SchemaPanel";

const LANGUAGES: { id: LanguageId; label: string; short: string }[] = [
  { id: "sql", label: "SQL", short: "SQL" },
  { id: "web", label: "Web", short: "Web" },
  { id: "javascript", label: "JavaScript", short: "JS" },
  { id: "typescript", label: "TypeScript", short: "TS" },
];

/** Monaco highlights by file extension, so a .css file inside Web mode gets
 *  CSS rather than the mode's default language. */
function monacoLanguageFor(fileName: string | undefined, mode: LanguageId): string {
  switch (fileName?.split(".").pop()?.toLowerCase()) {
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
    case "mts":
      return "typescript";
    case "sql":
      return "sql";
    default:
      return mode === "web" ? "html" : mode === "sql" ? "sql" : mode;
  }
}

const THEME_KEY = "playground:theme";
const LAST_PROJECT_KEY = "playground:lastProject";
const LAST_FILE_KEY = "playground:lastFile";
const SQLITE_EXTENSIONS = [".sqlite", ".sqlite3", ".db"];

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const defaultFileName = (language: LanguageId) =>
  `${language === "sql" ? "query" : "script"}.${EXTENSION[language]}`;

export interface AppProps {
  /** Returns to the landing view. Same URL — this is a view switch, not a nav. */
  onHome: () => void;
}

export default function App({ onHome }: AppProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [language, setLanguage] = useState<LanguageId>("sql");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [outputs, setOutputs] = useState<RunOutput[]>([]);
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const [editorPct, setEditorPct] = useState(58);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [consolePct, setConsolePct] = useState(50);

  // Engines are created once and reused for the life of the page. The lazy-ref
  // pattern avoids constructing a throwaway SQLite instance on every render.
  const sqliteRef = useRef<SqliteEngine | null>(null);
  if (!sqliteRef.current) sqliteRef.current = new SqliteEngine();

  const jsRef = useRef<JavaScriptEngine | null>(null);
  if (!jsRef.current) jsRef.current = new JavaScriptEngine("javascript");

  const webRef = useRef<WebEngine | null>(null);
  if (!webRef.current) webRef.current = new WebEngine();


  const transpilerRef = useRef<Transpiler | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const openLanguageLock = useRef<Promise<void>>(Promise.resolve());

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const projectIdRef = useRef<string | null>(projectId);
  projectIdRef.current = projectId;

  /** Last value written for the open file, so autosave only writes changes. */
  const persistedRef = useRef<string | null>(null);

  /** An edit that is debounced but not yet written. Held separately from the
   *  timer so switching files can flush it instead of losing it. */
  const pendingRef = useRef<{ fileId: string; source: string } | null>(null);

  /**
   * Writes any debounced edit immediately. Safe to call repeatedly.
   *
   * This owns the "Saved" indicator rather than the debounce timer, because
   * switching file or tab cancels that timer — the write still happens here,
   * and the indicator has to follow the write, not the timer.
   */
  const flushPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    // Raced against a timeout so a wedged IndexedDB — a blocked upgrade, a
    // stale tab, storage evicted mid-session — surfaces as "Not saved" rather
    // than leaving the indicator stuck on "Saving…" forever.
    const wrote = await Promise.race([
      updateFileSource(pending.fileId, pending.source).then(() => true),
      new Promise<false>((resolve) => window.setTimeout(() => resolve(false), 4000)),
    ]);

    if (!wrote) {
      setSaveState("error");
      return;
    }

    setFiles((current) =>
      current.map((f) => (f.id === pending.fileId ? { ...f, source: pending.source } : f)),
    );
    setSaveState("saved");
  }, []);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  /** SQL has no page to draw to, so it gets no preview column. */
  const showsPreview = language !== "sql";

  const refreshSchema = useCallback(async () => {
    try {
      setSchema(await sqliteRef.current!.getSchema());
    } catch {
      setSchema([]);
    }
  }, []);

  /** Writes the live database back to IndexedDB as a real .sqlite file. */
  const persistDatabase = useCallback(async () => {
    const id = projectIdRef.current;
    if (!id) return;
    try {
      await saveDatabaseBytes(id, await sqliteRef.current!.exportBytes());
    } catch {
      /* over quota, or storage blocked — the session still works */
    }
  }, []);

  const openFile = useCallback(
    (file: ProjectFile) => {
      // Flush first: changing these two pieces of state re-runs the autosave
      // effect, whose cleanup would otherwise cancel the outgoing write.
      void flushPending();
      setActiveFileId(file.id);
      setSource(file.source);
      persistedRef.current = file.source;
      setOutputs([]);
      setDuration(null);
      setHasRun(false);
      setSidebarOpen(false);
      try {
        localStorage.setItem(`${LAST_FILE_KEY}:${file.projectId}:${file.language}`, file.id);
      } catch {
        /* storage blocked */
      }
    },
    [flushPending],
  );

  /** Creates a blueprint's files in a project. `fillFirst` is only used by the
   *  starter path, so a blank project stays genuinely blank. */
  const seedFiles = useCallback(
    async (
      targetProject: string,
      targetLanguage: LanguageId,
      blueprint: FileBlueprint[],
      fillFirst?: string,
    ) => {
      const created = await Promise.all(
        blueprint.map((file, index) =>
          createFile(
            targetProject,
            targetLanguage,
            file.name,
            file.source || (index === 0 && fillFirst ? fillFirst : ""),
          ),
        ),
      );
      return created.filter((file): file is ProjectFile => file !== null);
    },
    [],
  );

  const loadFilesFor = useCallback(
    async (targetProject: string, targetLanguage: LanguageId) => {
      // Awaited so the listing below cannot read a record we are about to
      // overwrite with a debounced edit.
      await flushPending();

      let found = await listFiles(targetProject, targetLanguage);
      if (found.length === 0) {
        // A project with no files predates a mode's blueprint changing, or was
        // created before this mode existed. Blank files, not sample data.
        found = await seedFiles(targetProject, targetLanguage, BLANK_FILES[targetLanguage]);
      }
      setFiles(found);

      if (found.length === 0) {
        setActiveFileId(null);
        setSource("");
        return;
      }

      // Reopen whatever was last open here, not just the alphabetically first
      // file — landing on a different file reads as lost work.
      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem(`${LAST_FILE_KEY}:${targetProject}:${targetLanguage}`);
      } catch {
        /* storage blocked */
      }
      openFile(found.find((f) => f.id === lastId) ?? found[0]);
    },
    [openFile, flushPending, seedFiles],
  );

  const openProject = useCallback(
    async (id: string, targetLanguage: LanguageId) => {
      if (targetLanguage === "sql") {
        const bytes = await loadDatabaseBytes(id);
        if (bytes) await sqliteRef.current!.loadBytes(bytes);
        else await sqliteRef.current!.loadEmpty();
      }

      setProjectId(id);
      await loadFilesFor(id, targetLanguage);
      if (targetLanguage === "sql") await refreshSchema();
      try {
        localStorage.setItem(`${LAST_PROJECT_KEY}:${targetLanguage}`, id);
      } catch {
        /* storage blocked */
      }
    },
    [loadFilesFor, refreshSchema],
  );

  /**
   * Switches to a mode and opens its projects. Projects belong to exactly one
   * mode, so this is also what populates the sidebar. The first ever visit to a
   * mode gets one worked example; everything created afterwards is blank.
   */
  const runOpenLanguage = useCallback(
    async (next: LanguageId) => {
      let found = await listProjects(next);

      if (found.length === 0) {
        const seeded = await createProject(next === "sql" ? "Sample data" : "Getting started", next);
        if (seeded) {
          if (next === "sql") {
            await sqliteRef.current!.loadEmpty();
            await sqliteRef.current!.run(SAMPLE_DATABASE);
            await saveDatabaseBytes(seeded.id, await sqliteRef.current!.exportBytes());
          }
          await seedFiles(seeded.id, next, STARTER_FILES[next], STARTER_SNIPPETS[next]);
          found = [seeded];
        }
      }

      setProjects(found);
      if (found.length === 0) return;

      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem(`${LAST_PROJECT_KEY}:${next}`);
      } catch {
        /* storage blocked */
      }
      await openProject((found.find((p) => p.id === lastId) ?? found[0]).id, next);
    },
    [openProject, seedFiles],
  );

  /**
   * Seeding is read-then-write, so two overlapping calls would both find an
   * empty list and both create a project. Calls are serialised through a
   * promise chain rather than running concurrently.
   */
  const openLanguage = useCallback(
    async (next: LanguageId) => {
      const previous = openLanguageLock.current;
      let release!: () => void;
      openLanguageLock.current = new Promise<void>((resolve) => (release = resolve));
      await previous;
      try {
        await runOpenLanguage(next);
      } finally {
        release();
      }
    },
    [runOpenLanguage],
  );

  // StrictMode invokes mount effects twice in development. Without this guard
  // both runs find no projects and both seed one, leaving two "Sample data"
  // projects on a fresh install.
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void openLanguage("sql").then(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave the open file. The edit is parked in `pendingRef` the moment it
  // happens, so if this effect is torn down before the timer fires — switching
  // file, switching language, closing the tab — the write is flushed rather
  // than cancelled.
  useEffect(() => {
    if (!ready || !activeFileId || !projectId) return;
    if (persistedRef.current === source) return;

    pendingRef.current = { fileId: activeFileId, source };
    setSaveState("saving");

    const timer = window.setTimeout(() => {
      persistedRef.current = source;
      void flushPending();
      void touchProject(projectId);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [source, activeFileId, projectId, ready, flushPending]);

  // A reload during the debounce window would otherwise drop the last edit.
  useEffect(() => {
    const onHide = () => {
      void flushPending();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushPending]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* storage blocked — the toggle still works for this session */
    }
  }, [dark]);

  // Anything the sandbox emits after a run resolved — a setTimeout callback, a
  // late rejection — is appended rather than dropped.
  useEffect(() => {
    const append = (output: RunOutput) => setOutputs((current) => [...current, output]);
    const unsubscribe = [
      jsRef.current!.onLateOutput(append),
      webRef.current!.onLateOutput(append),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, []);

  // Give the sandbox its home before the first run, so the frame is created
  // directly inside the preview pane and never has to be reparented.
  useEffect(() => {
    if (!previewRef.current) return;
    jsRef.current!.mount(previewRef.current);
    webRef.current!.mount(previewRef.current);
  }, []);

  // The JS sandbox and the web document each own an iframe in the shared
  // preview box; only the active mode's frame should be on screen.
  useEffect(() => {
    jsRef.current!.setVisible(language === "javascript" || language === "typescript");
    webRef.current!.setVisible(language === "web");
  }, [language]);

  useEffect(() => {
    const sqlite = sqliteRef.current;
    const js = jsRef.current;
    const web = webRef.current;
    return () => {
      sqlite?.dispose();
      js?.dispose();
      web?.dispose();
    };
  }, []);

  const execute = useCallback(
    async (code: string) => {
      setRunning(true);
      setHasRun(true);
      try {
        if (language === "sql") {
          const result = await sqliteRef.current!.run(code);
          setOutputs(result.outputs);
          setDuration(result.durationMs);
          await refreshSchema();
          await persistDatabase();
        } else if (language === "web") {
          // Every web file in the project is bundled, using live editor text
          // for whichever one is open rather than its last-saved copy.
          const bundle = files.map((file) =>
            file.id === activeFileIdRef.current ? { ...file, source: code } : file,
          );
          const result = await webRef.current!.run(
            assembleWebDocument(bundle, SANDBOX_BOOTSTRAP),
          );
          setOutputs(result.outputs);
          setDuration(result.durationMs);
        } else {
          const engine = jsRef.current!;
          engine.setTranspiler(language === "typescript" ? transpilerRef.current : null);
          const result = await engine.run(code);
          setOutputs(result.outputs);
          setDuration(result.durationMs);
        }
      } catch (error) {
        setOutputs([
          { kind: "error", message: error instanceof Error ? error.message : String(error) },
        ]);
        setDuration(null);
      } finally {
        setRunning(false);
      }
    },
    [language, files, refreshSchema, persistDatabase],
  );

  const run = useCallback(() => {
    void execute(sourceRef.current);
  }, [execute]);

  /**
   * Clicking a table previews its rows. It deliberately does NOT write into the
   * editor — that would destroy whatever query you were working on. The results
   * grid labels itself with the SQL that ran, so nothing is hidden. No LIMIT:
   * the engine caps at MAX_ROWS and flags the result, so the whole table shows.
   */
  const selectTable = useCallback(
    (name: string) => {
      setSidebarOpen(false);
      void execute(`SELECT * FROM ${quoteIdent(name)};`);
    },
    [execute],
  );

  const changeLanguage = useCallback(
    async (next: LanguageId) => {
      if (next === language) return;
      setLanguage(next);
      setOutputs([]);
      setDuration(null);
      setHasRun(false);
      setSchema([]);
      await openLanguage(next);
    },
    [language, openLanguage],
  );

  /* ------------------------------------------------------------- file CRUD */

  const handleCreateFile = useCallback(
    async (name: string) => {
      if (!projectId) return;
      const created = await createFile(projectId, language, name, "");
      if (!created) return;
      setFiles(await listFiles(projectId, language));
      openFile(created);
    },
    [projectId, language, openFile],
  );

  const handleRenameFile = useCallback(
    async (id: string, name: string) => {
      if (!projectId) return;
      await renameFile(id, name);
      setFiles(await listFiles(projectId, language));
    },
    [projectId, language],
  );

  const handleDeleteFile = useCallback(
    async (id: string) => {
      if (!projectId) return;
      await deleteFile(id);
      const remaining = await listFiles(projectId, language);
      setFiles(remaining);
      if (id === activeFileIdRef.current && remaining.length > 0) openFile(remaining[0]);
    },
    [projectId, language, openFile],
  );

  /** A .sql/.js/.ts file from disk becomes a new file in the project. */
  const importCodeFile = useCallback(
    async (picked: File) => {
      if (!projectId) return;
      const text = await picked.text();
      const created = await createFile(projectId, language, picked.name, text);
      if (!created) return;
      setFiles(await listFiles(projectId, language));
      openFile(created);
    },
    [projectId, language, openFile],
  );

  const download = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadFile = useCallback(
    (file: ProjectFile) => {
      // The open file is read from editor state rather than the stored record,
      // so a download inside the autosave debounce still gets the latest text.
      const text = file.id === activeFileIdRef.current ? sourceRef.current : file.source;
      download(new Blob([text], { type: "text/plain;charset=utf-8" }), file.name);
    },
    [download],
  );

  /* ---------------------------------------------------------- data + files */

  const importDataFile = useCallback(
    async (picked: File) => {
      setSidebarOpen(false);
      setHasRun(true);
      setRunning(true);
      try {
        const lower = picked.name.toLowerCase();

        if (SQLITE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
          const buffer = await picked.arrayBuffer();
          await sqliteRef.current!.loadBytes(new Uint8Array(buffer));
          setOutputs([{ kind: "notice", text: `Opened ${picked.name}` }]);
        } else {
          const text = await picked.text();
          const table = lower.endsWith(".json")
            ? jsonToTable(picked.name, text)
            : csvToTable(picked.name, text);
          await sqliteRef.current!.createTable(table.name, table.columns, table.rows);

          // Previewed, not written into the editor — an import should never
          // clobber the query the user has open.
          const result = await sqliteRef.current!.run(
            `SELECT * FROM ${quoteIdent(table.name)};`,
          );
          setOutputs([
            {
              kind: "notice",
              text: `Imported ${table.rows.length} row${
                table.rows.length === 1 ? "" : "s"
              } into ${table.name}`,
            },
            ...result.outputs,
          ]);
        }

        await refreshSchema();
        await persistDatabase();
      } catch (error) {
        setOutputs([
          { kind: "error", message: error instanceof Error ? error.message : String(error) },
        ]);
      } finally {
        setRunning(false);
      }
    },
    [refreshSchema, persistDatabase],
  );

  const downloadDatabase = useCallback(async () => {
    const bytes = await sqliteRef.current!.exportBytes();
    const name = (projects.find((p) => p.id === projectId)?.name ?? "database").replace(
      /[^\w-]+/g,
      "_",
    );
    // Copied into a fresh buffer because the export view is backed by the wasm
    // heap, which Blob would otherwise capture by reference.
    download(new Blob([new Uint8Array(bytes)], { type: "application/x-sqlite3" }), `${name}.sqlite`);
  }, [download, projects, projectId]);

  /* ---------------------------------------------------------- project CRUD */

  /** A project the user creates is empty — blank files, no sample data. */
  const handleCreateProject = useCallback(
    async (name: string) => {
      const created = await createProject(name, language);
      if (!created) return;
      if (language === "sql") {
        await sqliteRef.current!.loadEmpty();
        await saveDatabaseBytes(created.id, await sqliteRef.current!.exportBytes());
      }
      await seedFiles(created.id, language, BLANK_FILES[language]);
      setProjects(await listProjects(language));
      await openProject(created.id, language);
    },
    [language, openProject, seedFiles],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await deleteProject(id);
      const remaining = await listProjects(language);
      setProjects(remaining);
      if (id === projectIdRef.current && remaining.length > 0) {
        await openProject(remaining[0].id, language);
      }
    },
    [language, openProject],
  );

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      await renameProject(id, name);
      setProjects(await listProjects(language));
    },
    [language],
  );

  /** Escape hatch: wipes storage and reloads, for a database that has wedged
   *  or data the user simply wants gone. */
  const wipeStorage = useCallback(async () => {
    pendingRef.current = null;
    await clearAll();
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("playground:")) localStorage.removeItem(key);
      }
    } catch {
      /* storage blocked */
    }
    window.location.reload();
  }, []);

  const resetEditor = useCallback(async () => {
    setSource(NEW_PROJECT_SNIPPETS[language]);
    setOutputs([]);
    setDuration(null);
    setHasRun(false);
    if (language === "javascript" || language === "typescript") await jsRef.current!.reset();
    else if (language === "web") await webRef.current!.reset();
  }, [language]);

  /** Divider between console and preview — side by side on desktop, stacked on
   *  phones, so which axis it resizes is read off the live layout. */
  const startOutputDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const container = outputRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const horizontal = getComputedStyle(container).flexDirection === "row";

    const onMove = (move: PointerEvent) => {
      const pct = horizontal
        ? ((move.clientX - rect.left) / rect.width) * 100
        : ((move.clientY - rect.top) / rect.height) * 100;
      setConsolePct(Math.min(85, Math.max(15, pct)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const startDrag = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMove = (move: PointerEvent) => {
      const pct = ((move.clientY - rect.top) / rect.height) * 100;
      setEditorPct(Math.min(85, Math.max(15, pct)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // Declared once and placed in whichever header row the breakpoint uses. Only
  // one copy is ever displayed, so there is no duplicate in the a11y tree.
  const languageTabs = (
    <nav className="flex w-full items-stretch sm:w-auto">
      {LANGUAGES.map(({ id, label, short }) => (
        <button
          key={id}
          type="button"
          onClick={() => void changeLanguage(id)}
          aria-current={language === id}
          title={label}
          // flex-1 on phones makes three even, centred tabs across the row;
          // from `sm` up they size to their labels and sit inline.
          className={`flex-1 border-b-2 px-4 py-2 text-center text-[12.5px] font-medium transition-colors sm:flex-none sm:px-3 ${
            language === id
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:border-line hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark"
          }`}
        >
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </nav>
  );

  const fileLabel = activeFile ? (
    <div className="flex min-w-0 flex-1 items-baseline gap-2 pl-1 sm:pl-2">
      <span className="min-w-0 truncate font-mono text-[12px] text-muted dark:text-muted-dark">
        {activeFile.name}
      </span>
      {saveState !== "idle" && (
        <span
          title={
            saveState === "error"
              ? "The browser database did not respond. Close other tabs of this app and reload."
              : undefined
          }
          className={`flex-shrink-0 text-[11px] ${
            saveState === "error"
              ? "font-medium text-red-600 dark:text-red-400"
              : "text-muted dark:text-muted-dark"
          }`}
        >
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
        </span>
      )}
    </div>
  ) : null;

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectsTree
        projects={projects}
        currentId={projectId}
        onSelect={(id) => void openProject(id, language)}
        onCreate={(name) => void handleCreateProject(name)}
        onRename={(id, name) => void handleRenameProject(id, name)}
        onDelete={(id) => void handleDeleteProject(id)}
      >
        {language === "sql" && (
          <SchemaPanel
            tables={schema}
            onSelectTable={selectTable}
            onImportFile={(picked) => void importDataFile(picked)}
            onDownload={() => void downloadDatabase()}
          />
        )}

        <FilesPanel
          language={language}
          files={files}
          activeId={activeFileId}
          onOpen={openFile}
          onCreate={(name) => void handleCreateFile(name)}
          onRename={(id, name) => void handleRenameFile(id, name)}
          onDelete={(id) => void handleDeleteFile(id)}
          onImport={(picked) => void importCodeFile(picked)}
          onDownload={downloadFile}
        />
      </ProjectsTree>

      <div className="flex-shrink-0 border-t border-line p-2 dark:border-line-dark">
        {confirmingClear ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void wipeStorage()}
              className="flex-1 rounded-md bg-red-600 py-1.5 text-[12px] font-medium text-white hover:bg-red-700"
            >
              Delete everything
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium dark:border-line-dark"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            title="Remove every project, file and database stored in this browser"
            className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-medium text-muted hover:bg-canvas hover:text-red-600 dark:text-muted-dark dark:hover:bg-canvas-dark"
          >
            <Trash2 size={12} />
            Clear local data
          </button>
        )}
      </div>

      {/* Reset and theme live here on phones, where the header has no room. */}
      <div className="flex flex-shrink-0 gap-2 border-t border-line p-2 sm:hidden dark:border-line-dark">
        <button
          type="button"
          onClick={() => void resetEditor()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line py-1.5 text-[12px] font-medium dark:border-line-dark"
        >
          <RotateCcw size={13} />
          Reset
        </button>
        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line py-1.5 text-[12px] font-medium dark:border-line-dark"
        >
          {dark ? <Sun size={13} /> : <Moon size={13} />}
          Theme
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2 sm:gap-3 sm:p-3">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-sm dark:border-line-dark dark:bg-canvas-dark">
        <header className="flex flex-shrink-0 items-center gap-1.5 border-b border-line px-2 py-2 sm:gap-3 sm:px-3 dark:border-line-dark">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open panel"
            className="flex-shrink-0 rounded p-1.5 text-muted hover:bg-surface hover:text-ink md:hidden dark:text-muted-dark dark:hover:bg-surface-dark"
          >
            <PanelLeft size={16} />
          </button>

          <button
            type="button"
            onClick={onHome}
            title="Back to home"
            aria-label="Back to home"
            className="group flex flex-shrink-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-surface dark:hover:bg-surface-dark"
          >
            <span className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-accent font-mono text-[13px] font-bold text-white">
              <span className="transition-opacity group-hover:opacity-0">&gt;</span>
              <ArrowLeft
                size={13}
                className="absolute opacity-0 transition-opacity group-hover:opacity-100"
              />
            </span>
            <span className="text-[13px] font-semibold">Playground</span>
          </button>

          {/* Tabs ride in the header from `sm` up; on phones they drop to their
              own full-width row so the name and Run are never squeezed. */}
          <div className="hidden items-stretch self-stretch sm:flex">{languageTabs}</div>

          {fileLabel}

          <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => void resetEditor()}
              title="Reset — restore the starter code"
              aria-label="Reset"
              className="hidden rounded p-1.5 text-muted hover:bg-surface hover:text-ink sm:block dark:text-muted-dark dark:hover:bg-surface-dark dark:hover:text-ink-dark"
            >
              <RotateCcw size={15} />
            </button>

            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              title="Toggle theme"
              aria-label="Toggle theme"
              className="hidden rounded p-1.5 text-muted hover:bg-surface hover:text-ink sm:block dark:text-muted-dark dark:hover:bg-surface-dark dark:hover:text-ink-dark"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button
              type="button"
              onClick={run}
              disabled={running}
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60 sm:px-3"
            >
              <Play size={12} fill="currentColor" />
              {running ? "Running" : "Run"}
            </button>
          </div>
        </header>

        {/* No vertical padding: the tabs supply it, so each tab's underline
            lands exactly on the row's bottom border. */}
        <div className="flex flex-shrink-0 items-stretch border-b border-line px-2 sm:hidden dark:border-line-dark">
          {languageTabs}
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 flex-shrink-0 border-r border-line bg-surface md:block dark:border-line-dark dark:bg-surface-dark">
            {sidebar}
          </aside>

          {sidebarOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setSidebarOpen(false)}
                role="presentation"
              />
              <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-lg dark:border-line-dark dark:bg-surface-dark">
                {sidebar}
              </div>
            </div>
          )}

          <div ref={splitRef} className="flex min-w-0 flex-1 flex-col">
            <div style={{ height: `${editorPct}%` }} className="min-h-0">
              <CodeEditor
                value={source}
                language={monacoLanguageFor(activeFile?.name, language)}
                dark={dark}
                onChange={setSource}
                onRun={run}
                onTranspilerReady={(transpile) => {
                  transpilerRef.current = transpile;
                }}
              />
            </div>

            <div
              role="separator"
              aria-orientation="horizontal"
              onPointerDown={startDrag}
              className="group flex h-2 flex-shrink-0 touch-none cursor-row-resize items-center justify-center border-y border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
            >
              <div className="h-0.5 w-8 rounded-full bg-line transition-colors group-hover:bg-accent dark:bg-line-dark" />
            </div>

            {/* Console and preview sit side by side on desktop, stacked on
                phones where a split would leave both unusably narrow. */}
            <div ref={outputRef} className="flex min-h-0 flex-1 flex-col md:flex-row">
              <div
                className="min-h-0 min-w-0 flex-1"
                // flexBasis rather than width so the same value splits
                // horizontally on desktop and vertically on stacked phones.
                // Omitted entirely in SQL mode so the console fills the row.
                style={
                  showsPreview
                    ? { flexBasis: `${consolePct}%`, flexGrow: 0, flexShrink: 0 }
                    : undefined
                }
              >
                <ResultsPane
                  outputs={outputs}
                  running={running}
                  durationMs={duration}
                  hasRun={hasRun}
                  title={language === "sql" ? "Results" : "Console"}
                />
              </div>

              <div
                role="separator"
                onPointerDown={startOutputDrag}
                className={`group flex-shrink-0 touch-none cursor-row-resize items-center justify-center border-line bg-surface md:cursor-col-resize dark:border-line-dark dark:bg-surface-dark ${
                  showsPreview ? "flex" : "hidden"
                } h-2 w-full border-y md:h-auto md:w-2 md:border-x md:border-y-0`}
              >
                <div className="h-0.5 w-8 rounded-full bg-line transition-colors group-hover:bg-accent md:h-8 md:w-0.5 dark:bg-line-dark" />
              </div>

              {/* Always mounted, only hidden: unmounting would reparent the
                  iframe and force the browser to reload the sandbox. */}
              <div
                className={showsPreview ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
              >
                <div className="flex flex-shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase dark:border-line-dark dark:text-muted-dark">
                  <MonitorPlay size={12} />
                  Preview
                </div>
                {/* The wrapper scrolls as well as the frame document. On iOS an
                    iframe renders its full content height and clips instead of
                    scrolling, so the outer box is what actually moves there. */}
                <div
                  ref={previewRef}
                  className="min-h-0 flex-1 overflow-auto bg-white [-webkit-overflow-scrolling:touch]"
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-[11.5px] text-muted dark:text-muted-dark">
        <p className="hidden sm:block">
          Everything runs in your browser — no signup, nothing uploaded, works offline.
        </p>
        <p>
          Built by{" "}
          <a
            href="https://www.dplooy.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            Dplooy
          </a>{" "}
          — free hosting for static sites
        </p>
      </footer>
    </div>
  );
}
