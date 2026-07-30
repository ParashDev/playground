# Playground

A free browser-based playground for **SQL, JavaScript, TypeScript and full HTML/CSS/JS apps**.
There is no backend: everything runs in the browser, nothing is uploaded, and projects are stored
in the visitor's own IndexedDB.

Live at **[playground.dplooy.com](https://playground.dplooy.com)**.

## The four modes

| Mode | Runtime | Output |
| --- | --- | --- |
| **SQL** | Real SQLite compiled to WebAssembly (`sql.js`) | Result grid |
| **Web** | The project's HTML, CSS and JS bundled into one document | Live page + console |
| **JavaScript** | Sandboxed iframe | Live page + console |
| **TypeScript** | Same sandbox, compiled by Monaco's TypeScript service | Live page + console |

**SQL** is genuine SQLite, not an emulation — joins, CTEs, window functions, indexes and
transactions all behave as they do on the desktop. CSV and JSON files import as tables with
inferred column types, existing `.sqlite` databases open straight from disk, and the whole database
downloads back out as a real `.sqlite` file.

**Web** assembles every `.html`, `.css` and `.js` file in the project into a single document and
renders it in a fresh iframe on each run, so no timers, listeners or globals leak between runs. The
frame keeps the pane's dimensions rather than being sized to its content, so `100vh` and media
queries behave the way they do in a real browser tab.

## Architecture

```
index.html            single entry — landing and playground are two views of one URL
src/
  main.tsx            mounts Root
  Root.tsx            view switch: landing | playground (no routing, no URL change)
  landing/            marketing page, same Tailwind design system as the app
  app/App.tsx         the playground shell
  engines/            one file per runtime, all behind the Engine interface
    types.ts            Engine contract + shared output types
    sqlite.ts           SQLite via sql.js
    javascript.ts       sandboxed iframe, persistent across runs
    web.ts              sandboxed iframe, rebuilt per run
    sandbox-bootstrap.ts  the script injected into every sandbox
  editor/             Monaco wrapper
  ui/                 files panel, projects tree, schema panel, results pane
  storage/db.ts       IndexedDB: projects, files, databases
  data/               sample content, CSV/JSON import, web bundler
```

### Adding a runtime

Everything the shell touches goes through the `Engine` interface in
[`src/engines/types.ts`](src/engines/types.ts):

```ts
interface Engine {
  readonly id: LanguageId;
  readonly monacoLanguage: string;
  init(): Promise<void>;
  run(source: string): Promise<RunResult>;
  getSchema?(): Promise<SchemaTable[]>;   // SQL engines only
  reset(): Promise<void>;
  dispose(): void;
}
```

A new language is one file implementing that, plus an entry in the `LANGUAGES` registry and the
`BLANK_FILES` / `STARTER_FILES` blueprints. No UI changes required.

### Sandboxing

User code runs in an iframe with `sandbox="allow-scripts"` and **deliberately without
`allow-same-origin`**, which puts it on an opaque origin — it cannot read the host page's DOM,
cookies, `localStorage` or IndexedDB. The only channel is `postMessage`.

**Never add `allow-same-origin` to those frames.** It is the single change that would break the
isolation entirely.

### Storage

One IndexedDB database (`playground`) with three stores:

- `projects` — a project belongs to exactly one mode
- `files` — named files, indexed by project and language
- `databases` — the SQLite file bytes, per SQL project

Files autosave ~400 ms after typing stops. A pending write is parked in a ref rather than living
only in a timer, so switching file, switching mode, or hiding the tab **flushes** it instead of
cancelling it.

`upgrade()` in [`src/storage/db.ts`](src/storage/db.ts) is schema-only and fully synchronous. The
upgrade transaction commits as soon as the microtask queue drains, so async work there can outlive
its transaction and leave `openDB` unresolved — which manifests as writes that silently never
complete.

## What is not bundled

Two large dependencies load from jsDelivr rather than shipping in `dist`:

- **Monaco** — the VS Code editor, via `@monaco-editor/react`
- **`sql-wasm.wasm`** — the SQLite binary

The sql.js version is pinned in [`src/engines/sqlite.ts`](src/engines/sqlite.ts). **If you bump
`sql.js` in `package.json`, bump `SQLJS_VERSION` to match** — the bundled JavaScript glue and the
CDN binary are a matched pair, and a mismatch fails at instantiation.

This keeps `dist` at roughly 0.66 MB and means the host never has to serve a `.wasm` file.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc -b
npm run build      # static bundle in dist/
npm run preview    # serve the built bundle
```

`dist/` is a plain static folder, deployable to any static host.

## Licences

Bundled dependencies keep their own: SQLite is public domain, `sql.js` is MIT, Monaco is MIT.
