import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Database,
  FileCode2,
  FileDown,
  Layers,
  Minus,
  MonitorPlay,
  Play,
  ShieldCheck,
  Table2,
  Terminal,
  WifiOff,
} from "lucide-react";

export interface LandingProps {
  /** Switches the app to the editor. Deliberately not a link — the playground
   *  is a view of this same page, so the URL never changes. */
  onOpen: () => void;
}

/* ------------------------------------------------------------------ pieces */

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-6">{children}</div>;
}

function SectionHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="mb-3 font-mono text-[12px] font-semibold tracking-[0.09em] text-accent uppercase">
        {eyebrow}
      </p>
      <h2 className="text-[clamp(1.7rem,3.4vw,2.4rem)] leading-[1.14] font-bold tracking-[-0.028em] text-ink">
        {title}
      </h2>
      {lede && <p className="mt-4 text-[17px] text-muted">{lede}</p>}
    </div>
  );
}

function OpenButton({
  onOpen,
  children = "Open Playground",
}: {
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-3 text-[15px] font-semibold text-white transition hover:-translate-y-px hover:bg-accent-hover"
    >
      {children}
      <ArrowRight size={16} />
    </button>
  );
}

/* ------------------------------------------------------- product window mock */

const SQL_SAMPLE = (
  <>
    <span className="text-muted italic">-- revenue by rep, ranked</span>
    {"\n"}
    <span className="font-semibold text-accent-hover">SELECT</span>
    {"\n  e.name,\n  "}
    <span className="font-semibold text-accent-hover">COUNT</span>
    {"(*) "}
    <span className="font-semibold text-accent-hover">AS</span>
    {" deals,\n  "}
    <span className="font-semibold text-accent-hover">SUM</span>
    {"(s.amount) "}
    <span className="font-semibold text-accent-hover">AS</span>
    {" revenue\n"}
    <span className="font-semibold text-accent-hover">FROM</span>
    {" sales s\n"}
    <span className="font-semibold text-accent-hover">JOIN</span>
    {" employees e "}
    <span className="font-semibold text-accent-hover">ON</span>
    {" e.id = s.employee_id\n"}
    <span className="font-semibold text-accent-hover">GROUP BY</span>
    {" e.name\n"}
    <span className="font-semibold text-accent-hover">ORDER BY</span>
    {" revenue "}
    <span className="font-semibold text-accent-hover">DESC</span>
    {";"}
  </>
);

const RESULT_ROWS = [
  ["Lena Hoffmann", "3", "85,600.00"],
  ["Tobias Krause", "3", "52,460.00"],
  ["Diego Santos", "3", "27,760.00"],
];

function AppShot() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas text-left shadow-[0_1px_2px_rgba(10,12,16,0.04),0_24px_56px_-20px_rgba(10,12,16,0.28)]">
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-accent font-mono text-[12px] font-bold text-white">
          &gt;
        </span>
        <nav className="ml-1 flex items-stretch">
          {["SQL", "Web", "JS", "TS"].map((tab) => (
            <span
              key={tab}
              className={`border-b-2 px-3 py-1.5 text-[13px] font-medium ${
                tab === "SQL" ? "border-accent text-accent" : "border-transparent text-muted"
              }`}
            >
              {tab}
            </span>
          ))}
        </nav>
        <span className="ml-2 hidden font-mono text-[12px] text-muted sm:inline">revenue.sql</span>
        <span className="hidden text-[11px] text-muted sm:inline">Saved</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-semibold text-white">
          <Play size={11} fill="currentColor" />
          Run
        </span>
      </div>

      <div className="flex min-h-[330px]">
        <aside className="hidden w-52 flex-shrink-0 border-r border-line bg-surface py-2 md:block">
          <p className="px-3.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
            Projects
          </p>
          <p className="px-3.5 py-1 text-[13px] font-semibold text-ink">Sales data</p>
          <p className="mt-2 px-3.5 py-1 pl-7 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
            Tables
          </p>
          {[
            ["departments", "4"],
            ["employees", "10"],
            ["sales", "10"],
          ].map(([name, count]) => (
            <p
              key={name}
              className="flex items-center gap-2 py-0.5 pr-3.5 pl-7 font-mono text-[12px]"
            >
              <Table2 size={11} className="flex-shrink-0 text-accent" />
              <span className="text-ink">{name}</span>
              <span className="ml-auto font-mono text-[10px] text-muted">{count}</span>
            </p>
          ))}
          <p className="mt-2 px-3.5 py-1 pl-7 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
            Files
          </p>
          <p className="py-0.5 pr-3.5 pl-7 font-mono text-[12px] font-semibold text-accent">
            revenue.sql
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <pre className="overflow-x-auto border-b border-line px-5 py-4 font-mono text-[12.5px] leading-[1.85] text-ink">
            {SQL_SAMPLE}
          </pre>

          <div className="flex-1">
            <div className="flex items-center gap-2 border-b border-line px-5 py-2 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <Terminal size={11} />
              Results
              <span className="ml-auto font-mono text-[10px] normal-case">2 ms</span>
            </div>
            <table className="w-full border-collapse font-mono text-[12px]">
              <thead>
                <tr>
                  {["name", "deals", "revenue"].map((column) => (
                    <th
                      key={column}
                      className="border-b border-line bg-surface px-5 py-1.5 text-left font-semibold whitespace-nowrap text-ink"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESULT_ROWS.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td
                        key={index}
                        className={`border-b border-line px-5 py-1.5 whitespace-nowrap ${
                          index === 0 ? "text-ink" : "text-muted"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- data */

const MODES = [
  {
    tag: "SQL",
    title: "A real SQLite database",
    body: "Not a simulation — SQLite compiled to WebAssembly. Joins, CTEs, window functions and transactions behave exactly as they do on your machine. Import a CSV, JSON or .sqlite file, and download the database back out.",
    code: "SELECT name, salary,\n  RANK() OVER (\n    PARTITION BY dept\n    ORDER BY salary DESC\n  ) AS rank\nFROM employees;",
  },
  {
    tag: "Web",
    title: "A complete HTML, CSS and JS app",
    body: "Three files bundled into one running page, rendered live beside the editor with a proper viewport — so 100vh and media queries behave like a real browser tab. Every run starts from a clean slate.",
    code: '<h1>Counter</h1>\n<button id="up">+</button>\n\n// script.js\nup.onclick = () =>\n  out.textContent = ++n;',
  },
  {
    tag: "JavaScript",
    title: "A sandboxed scratchpad",
    body: "Top-level await, console.table as an actual grid, proper formatting for objects, Map, Set and circular refs, and full stack traces. Late output from a setTimeout still appears instead of being dropped.",
    code: 'const res = await fetch(url);\nconsole.table(await res.json());\n\nsetTimeout(() =>\n  console.log("still logged"), 500);',
  },
  {
    tag: "TypeScript",
    title: "With real type checking",
    body: "The editor is the one from Visual Studio Code, including the TypeScript language service — autocomplete, hover docs and genuine type errors as you type. The same service compiles what runs.",
    code: "function groupBy<T, K extends string>(\n  items: T[],\n  key: (item: T) => K,\n) { /* … */ }",
  },
];

const FEATURES = [
  {
    icon: Database,
    title: "Import CSV, JSON, .sqlite",
    body: "Drop a file onto the tables panel. Column types are inferred and the table is created, ready to query.",
  },
  {
    icon: FileDown,
    title: "Export anything",
    body: "Download the whole database as a real .sqlite file, or any single file back to disk.",
  },
  {
    icon: Layers,
    title: "Projects and files",
    body: "Each project holds its own files and, for SQL, its own database. No clutter from the other modes.",
  },
  {
    icon: FileCode2,
    title: "Autosave, always",
    body: "Files save as you type. Switch file, switch mode, or close the tab — the edit is written, not lost.",
  },
  {
    icon: MonitorPlay,
    title: "Live preview",
    body: "A resizable preview panel beside the console, so you see the page and its output at the same time.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    body: "After the first visit everything runs locally. No connection needed, on a plane or otherwise.",
  },
];

const THEM = [
  "Your code is uploaded to their servers",
  "Rate limits, queues and cold starts",
  "An account before you can save anything",
  "Free tier caps on runs or execution time",
  "Your data sits on someone else's disk",
];

const US = [
  "Nothing is uploaded — there is no server",
  "Instant, unlimited runs on your own CPU",
  "No account, no email, no signup at all",
  "Every feature free, with no caps",
  "Projects stored in your browser, yours to clear",
];

const FAQ = [
  {
    q: "Is it free?",
    a: "Completely. No paid tier, no trial, no feature gates, no ads. There is no server to pay for, which is what makes that sustainable.",
  },
  {
    q: "Is there a signup?",
    a: "No. There are no accounts, no email capture, and nothing to dismiss. Open it and start typing.",
  },
  {
    q: "Is my code uploaded anywhere?",
    a: "No. Playground is a static bundle of HTML, JavaScript and CSS with no backend. After it loads it makes no requests — you can confirm that in your browser's network inspector. Your projects live in your browser's own database.",
  },
  {
    q: "Is the SQL real SQLite?",
    a: "Yes — real SQLite compiled to WebAssembly, not a subset or an emulation. If a query works here, it works in SQLite.",
  },
  {
    q: "Can I use my own data?",
    a: "Yes. Drop in a CSV or JSON file and it becomes a queryable table with inferred column types, or open an existing .sqlite database straight from disk. You can download the database back out at any time.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. After the first visit everything runs locally, with no network connection at all.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes — the layout adapts to small screens. A keyboard makes longer edits easier, but reading and running work fine on a phone.",
  },
];

/* --------------------------------------------------------------------- page */

export default function Landing({ onOpen }: LandingProps) {
  return (
    <div className="min-h-full bg-canvas text-muted">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <Shell>
          <div className="flex h-[60px] items-center gap-8">
            <span className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-ink">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-accent font-mono text-[12px] font-bold text-white">
                &gt;
              </span>
              Playground
            </span>
            <nav className="mx-auto hidden gap-7 md:flex">
              {[
                ["Modes", "#modes"],
                ["Features", "#features"],
                ["Privacy", "#privacy"],
                ["FAQ", "#faq"],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="text-[14px] font-medium text-muted hover:text-ink"
                >
                  {label}
                </a>
              ))}
            </nav>
            <button
              type="button"
              onClick={onOpen}
              className="ml-auto rounded-[9px] bg-accent px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-accent-hover md:ml-0"
            >
              Open Playground
            </button>
          </div>
        </Shell>
      </header>

      {/* Dot grid, not a colour wash — texture that fades toward the content. */}
      <section className="relative overflow-hidden pt-24 pb-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_1px_1px,#d8dce2_1px,transparent_0)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_0%,#000_35%,transparent_100%)]"
        />
        <Shell>
          <div className="relative mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas py-1.5 pr-3.5 pl-2 text-[13px] font-medium text-muted">
              <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-hover">
                No server
              </span>
              Everything runs in your browser
            </span>

            <h1 className="mt-6 text-[clamp(2.4rem,6vw,4rem)] leading-[1.03] font-bold tracking-[-0.035em] text-ink">
              Run SQL, JavaScript and full web apps —{" "}
              <span className="text-accent">without a server</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-[clamp(1rem,1.6vw,1.18rem)] leading-relaxed">
              A free scratchpad for querying a real SQLite database, running JavaScript and
              TypeScript, and building a complete HTML/CSS/JS page. No signup, no uploads, no rate
              limits — because there is nothing behind it but your own browser.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <OpenButton onOpen={onOpen} />
              <a
                href="#modes"
                className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-canvas px-5 py-3 text-[15px] font-semibold text-ink transition hover:-translate-y-px hover:border-ink"
              >
                See what it does
              </a>
            </div>

            <p className="mt-5 font-mono text-[12.5px] tracking-tight text-muted">
              Opens instantly · nothing to install · works offline
            </p>
          </div>

          <div className="relative mx-auto mt-16 max-w-5xl">
            <AppShot />
          </div>
        </Shell>
      </section>

      <section id="modes" className="border-y border-line bg-surface py-20">
        <Shell>
          <SectionHead
            eyebrow="Four modes"
            title="One workspace, four runtimes"
            lede="Each mode keeps its own projects and files, so a database and a web page never end up in the same drawer."
          />

          <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2">
            {MODES.map((mode) => (
              <article
                key={mode.tag}
                className="flex flex-col rounded-xl border border-line bg-canvas p-7 transition hover:-translate-y-0.5 hover:border-muted/40"
              >
                <span className="self-start rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[12px] font-semibold text-accent-hover">
                  {mode.tag}
                </span>
                <h3 className="mt-4 text-[19px] font-semibold tracking-tight text-ink">
                  {mode.title}
                </h3>
                <p className="mt-2 text-[15px]">{mode.body}</p>
                <pre className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[12.5px] leading-[1.75] text-ink">
                  {mode.code}
                </pre>
              </article>
            ))}
          </div>
        </Shell>
      </section>

      <section id="features" className="py-20">
        <Shell>
          <SectionHead eyebrow="Built in" title="The parts you'd otherwise pay for" />

          <div className="mx-auto mt-12 grid max-w-5xl gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <h3 className="mb-1.5 flex items-center gap-2 text-[16px] font-semibold tracking-tight text-ink">
                  <Icon size={16} className="flex-shrink-0 text-accent" />
                  {title}
                </h3>
                <p className="text-[15px]">{body}</p>
              </div>
            ))}
          </div>
        </Shell>
      </section>

      <section id="privacy" className="border-y border-line bg-surface py-20">
        <Shell>
          <SectionHead
            eyebrow="Why it's different"
            title="Every other playground runs your code on their machine"
            lede="That single fact is where the account walls, the queues and the caps come from. Remove the server and all of it goes away."
          />

          <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-canvas p-7">
              <h3 className="mb-4 text-[13px] font-semibold tracking-[0.07em] text-muted uppercase">
                Server-based playgrounds
              </h3>
              <ul className="m-0 list-none p-0">
                {THEM.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 border-t border-line py-2.5 text-[15px] first:border-t-0"
                  >
                    <Minus size={15} className="mt-1 flex-shrink-0 text-muted/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-accent bg-canvas p-7 ring-4 ring-accent/10">
              <h3 className="mb-4 text-[13px] font-semibold tracking-[0.07em] text-accent-hover uppercase">
                Playground
              </h3>
              <ul className="m-0 list-none p-0">
                {US.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 border-t border-line py-2.5 text-[15px] text-ink first:border-t-0"
                  >
                    <Check size={15} className="mt-1 flex-shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mx-auto mt-8 flex max-w-2xl items-start justify-center gap-2.5 text-center text-[15px]">
            <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-accent" />
            <span>
              Playground is a static bundle of HTML, JavaScript and CSS. After it loads it makes no
              requests at all — open your browser's network inspector and watch.
            </span>
          </p>
        </Shell>
      </section>

      <section id="faq" className="py-20">
        <Shell>
          <SectionHead eyebrow="Questions" title="Frequently asked" />

          <div className="mx-auto mt-10 max-w-3xl text-left">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group border-b border-line">
                <summary className="flex cursor-pointer list-none items-center gap-4 py-4 text-[17px] font-semibold tracking-tight text-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="ml-auto font-mono text-[20px] font-normal text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mb-5 max-w-2xl text-[15.5px]">{a}</p>
              </details>
            ))}
          </div>
        </Shell>
      </section>

      <section className="border-t border-line py-24 text-center">
        <Shell>
          <h2 className="mx-auto max-w-2xl text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] font-bold tracking-[-0.03em] text-ink">
            Open it and start typing
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px]">
            No account, no install, no upload. Close the tab and nothing about your work leaves your
            machine.
          </p>
          <div className="mt-9 flex justify-center">
            <OpenButton onOpen={onOpen} />
          </div>
        </Shell>
      </section>

      <footer className="border-t border-line bg-surface py-8">
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
            <p className="text-[14px] text-muted">
              Everything runs in your browser — no signup, nothing uploaded, works offline.
            </p>
            <p className="text-[14px] text-muted">
              Built by{" "}
              <a
                href="https://www.dplooy.com"
                className="font-semibold text-accent hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Dplooy
              </a>{" "}
              — free hosting for static sites.
            </p>
          </div>
        </Shell>
      </footer>
    </div>
  );
}
