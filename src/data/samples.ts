import type { LanguageId } from "../engines/types";

/**
 * Seeded into every fresh SQLite database. Small enough to be instant, wide
 * enough to demonstrate joins, aggregates, dates, and window functions — the
 * things people actually come to a SQL playground to try.
 */
export const SAMPLE_DATABASE = `
CREATE TABLE departments (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  city    TEXT NOT NULL
);

CREATE TABLE employees (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  salary        INTEGER NOT NULL,
  hired_on      TEXT NOT NULL
);

CREATE TABLE sales (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  product     TEXT NOT NULL,
  amount      REAL NOT NULL,
  sold_on     TEXT NOT NULL
);

INSERT INTO departments (id, name, city) VALUES
  (1, 'Engineering', 'Lisbon'),
  (2, 'Sales',       'Berlin'),
  (3, 'Support',     'Toronto'),
  (4, 'Design',      'Lisbon');

INSERT INTO employees (id, name, title, department_id, salary, hired_on) VALUES
  (1,  'Ana Ferreira',   'Staff Engineer',    1, 128000, '2019-03-11'),
  (2,  'Marcus Bell',    'Engineer',          1,  96000, '2021-07-01'),
  (3,  'Priya Raman',    'Engineering Lead',  1, 141000, '2018-01-22'),
  (4,  'Tobias Krause',  'Account Executive', 2,  88000, '2020-09-14'),
  (5,  'Lena Hoffmann',  'Sales Director',    2, 134000, '2017-05-02'),
  (6,  'Diego Santos',   'Account Executive', 2,  84000, '2022-02-28'),
  (7,  'Wei Zhang',      'Support Engineer',  3,  72000, '2021-11-08'),
  (8,  'Fatima Noor',    'Support Lead',      3,  91000, '2019-06-17'),
  (9,  'Jonas Meyer',    'Product Designer',  4,  98000, '2020-04-06'),
  (10, 'Clara Nunes',    'Design Lead',       4, 118000, '2018-10-29');

INSERT INTO sales (id, employee_id, product, amount, sold_on) VALUES
  (1,  4, 'Enterprise Plan', 24000.00, '2024-01-15'),
  (2,  4, 'Team Plan',        4800.00, '2024-01-29'),
  (3,  5, 'Enterprise Plan', 31000.00, '2024-02-03'),
  (4,  6, 'Team Plan',        4800.00, '2024-02-11'),
  (5,  6, 'Starter Plan',      960.00, '2024-02-19'),
  (6,  4, 'Enterprise Plan', 27500.00, '2024-03-02'),
  (7,  5, 'Team Plan',        9600.00, '2024-03-18'),
  (8,  6, 'Enterprise Plan', 22000.00, '2024-04-05'),
  (9,  5, 'Enterprise Plan', 45000.00, '2024-04-21'),
  (10, 4, 'Starter Plan',      960.00, '2024-05-09');
`;

export interface FileBlueprint {
  name: string;
  source: string;
}

/**
 * What a project the user creates by hand starts with: the files a mode needs
 * to function, and nothing else. No sample data — an empty project is empty.
 * Web is the exception only in that a page needs a skeleton to be valid HTML.
 */
export const BLANK_FILES: Record<LanguageId, FileBlueprint[]> = {
  sql: [{ name: "query.sql", source: "" }],
  javascript: [{ name: "script.js", source: "" }],
  typescript: [{ name: "script.ts", source: "" }],
  web: [
    {
      name: "index.html",
      source: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
  </head>
  <body>
    <h1>Hello</h1>
  </body>
</html>
`,
    },
    { name: "style.css", source: "" },
    { name: "script.js", source: "" },
  ],
};

/**
 * The worked example a mode opens with the very first time it is used. Single
 * file modes leave `source` empty and are filled from STARTER_SNIPPETS below,
 * which is declared after this and so cannot be referenced here directly.
 */
export const STARTER_FILES: Record<LanguageId, FileBlueprint[]> = {
  sql: [{ name: "query.sql", source: "" }],
  javascript: [{ name: "script.js", source: "" }],
  typescript: [{ name: "script.ts", source: "" }],
  web: [
    {
      name: "index.html",
      source: `<div class="card">
  <h1>Counter</h1>
  <p class="count" id="count">0</p>
  <div class="row">
    <button id="down">−</button>
    <button id="up">+</button>
  </div>
  <p class="hint">Edit index.html, style.css and script.js — Run bundles all three.</p>
</div>
`,
    },
    {
      name: "style.css",
      source: `body {
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  background: #f1f2f4;
  font-family: system-ui, sans-serif;
}

.card {
  background: #fff;
  border-radius: 14px;
  padding: 32px 40px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

h1 {
  margin: 0 0 8px;
  font-size: 18px;
  letter-spacing: -0.01em;
}

.count {
  margin: 0;
  font-size: 56px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0d9488;
}

.row {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}

button {
  width: 44px;
  height: 40px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  background: #fff;
  font-size: 18px;
  cursor: pointer;
}

button:hover {
  border-color: #0d9488;
  color: #0d9488;
}

.hint {
  margin: 20px 0 0;
  font-size: 12px;
  color: #64748b;
}
`,
    },
    {
      name: "script.js",
      source: `const output = document.getElementById("count");
let value = 0;

function render() {
  output.textContent = value;
}

document.getElementById("up").addEventListener("click", () => {
  value += 1;
  render();
});

document.getElementById("down").addEventListener("click", () => {
  value -= 1;
  render();
});

console.log("Counter ready — console.log still works here");
`,
    },
  ],
};

/** What a brand-new, empty project opens with. */
export const NEW_PROJECT_SNIPPETS: Record<LanguageId, string> = {
  sql: `-- This project's database is empty.
-- Import a CSV or JSON file from the Tables panel, or create a table here.

CREATE TABLE customers (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  city    TEXT,
  signed_up TEXT
);

INSERT INTO customers (name, city, signed_up) VALUES
  ('Ana Ferreira', 'Lisbon',  '2024-01-14'),
  ('Marcus Bell',  'Berlin',  '2024-02-02'),
  ('Wei Zhang',    'Toronto', '2024-03-27');

SELECT * FROM customers;
`,

  javascript: `console.log("Hello from JavaScript");
`,

  typescript: `const greeting: string = "Hello from TypeScript";
console.log(greeting);
`,

  web: `<h1>Hello</h1>
<p>Edit index.html, style.css and script.js — Run bundles all three.</p>
`,
};

export const STARTER_SNIPPETS: Record<LanguageId, string> = {
  sql: `-- A sample database is already loaded. Press Ctrl+Enter (Cmd+Enter) to run.
-- Every statement gets its own result grid.

SELECT
  d.name                        AS department,
  COUNT(*)                      AS headcount,
  ROUND(AVG(e.salary))          AS avg_salary,
  MAX(e.salary)                 AS top_salary
FROM employees e
JOIN departments d ON d.id = e.department_id
GROUP BY d.name
ORDER BY avg_salary DESC;

-- Window functions work too — rank each person within their department.
SELECT
  name,
  title,
  salary,
  RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rank_in_dept
FROM employees
ORDER BY department_id, rank_in_dept;
`,

  // Web ships three files rather than one snippet, so its starter content
  // lives in STARTER_FILES; this is only the page itself.
  web: STARTER_FILES.web[0].source,

  javascript: `// Runs in a sandboxed frame in your browser. Ctrl+Enter (Cmd+Enter) to run.

const team = [
  { name: "Ana",    role: "Engineering", salary: 128000 },
  { name: "Lena",   role: "Sales",       salary: 134000 },
  { name: "Jonas",  role: "Design",      salary: 98000 },
  { name: "Wei",    role: "Support",     salary: 72000 },
];

const total = team.reduce((sum, p) => sum + p.salary, 0);
console.log("Total payroll:", total.toLocaleString("en-US"));

// console.table renders as a real grid
console.table(team);

// async/await works at the top level
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(100);
console.log("…and so does await");
`,

  typescript: `// Full TypeScript with real type checking — hover a symbol, or introduce
// a type error and watch the editor complain. Ctrl+Enter (Cmd+Enter) to run.

interface Employee {
  name: string;
  department: "Engineering" | "Sales" | "Design" | "Support";
  salary: number;
}

const team: Employee[] = [
  { name: "Ana",   department: "Engineering", salary: 128000 },
  { name: "Lena",  department: "Sales",       salary: 134000 },
  { name: "Jonas", department: "Design",      salary: 98000 },
];

function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  return items.reduce((acc, item) => {
    (acc[key(item)] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

const byDepartment = groupBy(team, (e) => e.department);
console.log(byDepartment);

const highestPaid = team.reduce((a, b) => (a.salary > b.salary ? a : b));
console.log(\`Highest paid: \${highestPaid.name} (\${highestPaid.department})\`);
`,
};
