import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LanguageId } from "../engines/types";

export interface Project {
  id: string;
  name: string;
  /** A project belongs to one mode — a Web project has no SQL in it. */
  language: LanguageId;
  createdAt: number;
  updatedAt: number;
}

/** A named file inside a project. Projects hold many per language. */
export interface ProjectFile {
  id: string;
  projectId: string;
  language: LanguageId;
  name: string;
  source: string;
  updatedAt: number;
}

interface PlaygroundDB extends DBSchema {
  // Deliberately unindexed. An index on `language` would need every existing
  // record to carry the field, i.e. a data migration inside `upgrade` — and a
  // cursor walk there can outlive the auto-committing upgrade transaction and
  // wedge openDB. There are tens of projects; filtering in JS is free.
  projects: { key: string; value: Project };
  files: {
    key: string;
    value: ProjectFile;
    indexes: { "by-project": string; "by-project-language": [string, LanguageId] };
  };
  /** The whole SQLite file, exactly as `Database.export()` produced it. */
  databases: {
    key: string;
    value: { projectId: string; bytes: Uint8Array; updatedAt: number };
  };
}

const DB_NAME = "playground";
const DB_VERSION = 6;

/** Projects saved before modes existed were all SQL. */
const languageOf = (project: Project): LanguageId => project.language ?? "sql";

let handle: Promise<IDBPDatabase<PlaygroundDB>> | null = null;

function db(): Promise<IDBPDatabase<PlaygroundDB>> {
  if (!handle) {
    handle = openDB<PlaygroundDB>(DB_NAME, DB_VERSION, {
      // Schema only — no data is read or written here. Everything in this
      // callback must be synchronous, because the upgrade transaction commits
      // as soon as the microtask queue drains.
      upgrade(database) {
        const store = database as unknown as IDBDatabase;

        // v1–v3 stored one anonymous buffer per language plus a separate
        // snippet list. Files replaced both, so those stores are dropped.
        for (const name of ["buffers", "snippets"]) {
          if (store.objectStoreNames.contains(name)) store.deleteObjectStore(name);
        }

        if (!store.objectStoreNames.contains("projects")) {
          database.createObjectStore("projects", { keyPath: "id" });
        }
        if (!store.objectStoreNames.contains("databases")) {
          database.createObjectStore("databases", { keyPath: "projectId" });
        }
        if (!store.objectStoreNames.contains("files")) {
          const files = database.createObjectStore("files", { keyPath: "id" });
          files.createIndex("by-project", "projectId");
          files.createIndex("by-project-language", ["projectId", "language"]);
        }
      },

      // Another tab still holding an older version would otherwise block this
      // open forever, and every read and write with it.
      blocked() {
        console.warn("Playground: another tab is holding an older database version.");
      },
      blocking() {
        void handle?.then((open) => open.close());
        handle = null;
      },
      terminated() {
        handle = null;
      },
    });
  }
  return handle;
}

/** Random suffix so two writes inside the same millisecond cannot collide. */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------------------------------------------------------- projects */

/** Projects for one mode only — the sidebar never mixes SQL and Web. */
export async function listProjects(language: LanguageId): Promise<Project[]> {
  try {
    const all = await (await db()).getAll("projects");
    return all
      .filter((project) => languageOf(project) === language)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    // Private-mode Safari and blocked-storage setups reject IndexedDB outright.
    // The app still runs; it just will not remember anything across reloads.
    return [];
  }
}

export async function createProject(
  name: string,
  language: LanguageId,
): Promise<Project | null> {
  const now = Date.now();
  const project: Project = { id: newId(), name, language, createdAt: now, updatedAt: now };
  try {
    await (await db()).put("projects", project);
    return project;
  } catch {
    return null;
  }
}

export async function renameProject(id: string, name: string): Promise<void> {
  try {
    const database = await db();
    const existing = await database.get("projects", id);
    if (existing) await database.put("projects", { ...existing, name, updatedAt: Date.now() });
  } catch {
    /* storage unavailable */
  }
}

export async function touchProject(id: string): Promise<void> {
  try {
    const database = await db();
    const existing = await database.get("projects", id);
    if (existing) await database.put("projects", { ...existing, updatedAt: Date.now() });
  } catch {
    /* storage unavailable */
  }
}

/** Removes the project and everything belonging to it. */
export async function deleteProject(id: string): Promise<void> {
  try {
    const database = await db();
    const fileKeys = await database.getAllKeysFromIndex("files", "by-project", id);
    await Promise.all([
      database.delete("projects", id),
      database.delete("databases", id),
      ...fileKeys.map((key) => database.delete("files", key)),
    ]);
  } catch {
    /* storage unavailable */
  }
}

/* ------------------------------------------------------------------- files */

export async function listFiles(
  projectId: string,
  language: LanguageId,
): Promise<ProjectFile[]> {
  try {
    const found = await (await db()).getAllFromIndex("files", "by-project-language", [
      projectId,
      language,
    ]);
    return found.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function createFile(
  projectId: string,
  language: LanguageId,
  name: string,
  source: string,
): Promise<ProjectFile | null> {
  const file: ProjectFile = {
    id: newId(),
    projectId,
    language,
    name,
    source,
    updatedAt: Date.now(),
  };
  try {
    await (await db()).put("files", file);
    return file;
  } catch {
    return null;
  }
}

export async function updateFileSource(id: string, source: string): Promise<void> {
  try {
    const database = await db();
    const existing = await database.get("files", id);
    if (existing) await database.put("files", { ...existing, source, updatedAt: Date.now() });
  } catch {
    /* autosave is best-effort */
  }
}

export async function renameFile(id: string, name: string): Promise<void> {
  try {
    const database = await db();
    const existing = await database.get("files", id);
    if (existing) await database.put("files", { ...existing, name, updatedAt: Date.now() });
  } catch {
    /* storage unavailable */
  }
}

export async function deleteFile(id: string): Promise<void> {
  try {
    await (await db()).delete("files", id);
  } catch {
    /* already gone */
  }
}

/* --------------------------------------------------------------- databases */

export async function loadDatabaseBytes(projectId: string): Promise<Uint8Array | null> {
  try {
    const record = await (await db()).get("databases", projectId);
    return record?.bytes ?? null;
  } catch {
    return null;
  }
}

export async function saveDatabaseBytes(projectId: string, bytes: Uint8Array): Promise<void> {
  try {
    await (await db()).put("databases", { projectId, bytes, updatedAt: Date.now() });
  } catch {
    /* storage unavailable, or the database outgrew the quota */
  }
}

/** Wipes every byte this app has stored. */
export async function clearAll(): Promise<void> {
  try {
    const database = await db();
    await Promise.all([
      database.clear("projects"),
      database.clear("files"),
      database.clear("databases"),
    ]);
  } catch {
    /* nothing to clear */
  }
}
