# Markdown Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-style CLI that prints markdown (file or inline string) to TM-T88V with receipt-friendly formatting over the existing Windows RAW spooler path.

**Architecture:** Keep transport and low-level ESC/POS primitives unchanged, add a focused markdown-to-ESC/POS converter module, and introduce a non-test CLI entrypoint for markdown printing. Use strict mode as an opt-in validator while default mode degrades unsupported constructs to readable text.

**Tech Stack:** Node.js 20+, CommonJS modules, `markdown-it` parser, built-in `node:test` + `node:assert`, existing Windows RAW spooler bridge.

---

## File Structure

- Modify: `package.json` (new scripts, dependency, main entrypoint)
- Create: `src/print-cli.js` (production CLI entrypoint)
- Create: `src/markdown-to-escpos.js` (markdown renderer -> ESC/POS bytes)
- Create: `src/cli-common.js` (shared argument/printer helpers)
- Modify: `src/print-test.js` (reuse helper functions, keep smoke behavior)
- Create: `tests/markdown-to-escpos.test.js` (renderer unit tests)
- Create: `tests/print-cli.test.js` (CLI argument/behavior tests)
- Create: `tests/fixtures/markdown-basic.md` (fixture input)
- Modify: `README.md` (document new CLI usage)

### Task 1: Add test harness and markdown parser dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Write the failing script expectation test command**

Run:

```bash
npm run test
```

Expected: npm exits non-zero with missing-script error because `test` is not defined.

- [ ] **Step 2: Add test scripts and parser dependency in `package.json`**

Use this exact target content shape:

```json
{
  "main": "src/print-cli.js",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "print": "node src/print-cli.js",
    "print:dry": "node src/print-cli.js --dry-run",
    "print:test": "node src/print-test.js",
    "print:test:dry": "node src/print-test.js --dry-run",
    "print:test:save": "node src/print-test.js --save"
  },
  "dependencies": {
    "markdown-it": "^14.1.0"
  }
}
```

- [ ] **Step 3: Install dependency and lockfile updates**

Run:

```bash
npm install
```

Expected: install succeeds and updates `package-lock.json`.

- [ ] **Step 4: Verify test command now exists (and currently fails with no tests)**

Run:

```bash
npm run test
```

Expected: test runner executes, then fails because test files do not exist yet.

- [ ] **Step 5: Commit dependency and script setup**

```bash
git add package.json package-lock.json
git commit -m "chore: add markdown parser and node test scripts"
```

### Task 2: Extract shared CLI helpers

**Files:**
- Create: `src/cli-common.js`
- Modify: `src/print-test.js`
- Test: `tests/print-cli.test.js`

- [ ] **Step 1: Write failing tests for helper behavior**

Create `tests/print-cli.test.js` with these initial tests:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getArgValue, hasFlag, selectPrinterName } = require("../src/cli-common");

test("getArgValue reads --flag=value", () => {
  assert.equal(getArgValue(["--markdown=hi"], "--markdown"), "hi");
});

test("hasFlag detects boolean flag", () => {
  assert.equal(hasFlag(["--strict-markdown"], "--strict-markdown"), true);
});

test("selectPrinterName prioritizes explicit flag", () => {
  const printers = ["Printer A", "EPSON TM-T88V Receipt"];
  const selected = selectPrinterName({
    requested: "Printer A",
    envPrinter: "EPSON TM-T88V Receipt",
    printers
  });
  assert.equal(selected, "Printer A");
});
```

- [ ] **Step 2: Run the helper tests to confirm failure**

Run:

```bash
node --test tests/print-cli.test.js
```

Expected: FAIL with module-not-found for `src/cli-common.js`.

- [ ] **Step 3: Implement `src/cli-common.js` minimally**

Create `src/cli-common.js`:

```js
"use strict";

function getArgValue(argv, flag) {
  const arg = argv.find((v) => v.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : null;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function selectPrinterName({ requested, envPrinter, printers }) {
  return (
    requested ||
    envPrinter ||
    printers.find((p) => /epson|tm-t88v|receipt/i.test(p)) ||
    printers[0]
  );
}

module.exports = { getArgValue, hasFlag, selectPrinterName };
```

- [ ] **Step 4: Refactor `src/print-test.js` to consume helpers without behavior change**

Update imports and calls to use:

```js
const { getArgValue, hasFlag, selectPrinterName } = require("./cli-common");
```

and:

```js
const requested = getArgValue(process.argv, "--printer");
const printerName = selectPrinterName({
  requested,
  envPrinter: process.env.ESC_POS_PRINTER,
  printers
});
```

- [ ] **Step 5: Re-run helper tests to confirm pass**

Run:

```bash
node --test tests/print-cli.test.js
```

Expected: PASS for all helper tests.

- [ ] **Step 6: Commit helper extraction**

```bash
git add src/cli-common.js src/print-test.js tests/print-cli.test.js
git commit -m "refactor: extract shared cli argument and printer helpers"
```

### Task 3: Build markdown renderer with heading hierarchy and wrapping

**Files:**
- Create: `src/markdown-to-escpos.js`
- Test: `tests/markdown-to-escpos.test.js`
- Test Fixture: `tests/fixtures/markdown-basic.md`

- [ ] **Step 1: Write failing renderer tests first**

Create `tests/markdown-to-escpos.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { markdownToEscpos } = require("../src/markdown-to-escpos");

test("renders # heading with centered bold extra-large style sequence", () => {
  const out = markdownToEscpos("# Title\n", { charsPerLine: 42, strictMarkdown: false });
  const bytes = Buffer.from(out);
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x61, 0x01])), true); // align center
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x45, 0x01])), true); // bold on
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x21, 0x11])), true); // size(1,1)
});

test("renders ## heading as centered bold large but not extra-large", () => {
  const out = markdownToEscpos("## Subtitle\n", { charsPerLine: 42, strictMarkdown: false });
  const bytes = Buffer.from(out);
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x21, 0x10])), true); // large
});

test("wraps paragraph lines by charsPerLine", () => {
  const out = markdownToEscpos("word ".repeat(20), { charsPerLine: 16, strictMarkdown: false });
  assert.equal(Buffer.from(out).length > 0, true);
});
```

- [ ] **Step 2: Run renderer tests to confirm failure**

Run:

```bash
node --test tests/markdown-to-escpos.test.js
```

Expected: FAIL with module-not-found for `src/markdown-to-escpos.js`.

- [ ] **Step 3: Implement initial converter module**

Create `src/markdown-to-escpos.js` with these exported APIs and core behavior:

```js
"use strict";

const MarkdownIt = require("markdown-it");
const { concat, init, align, bold, size, line, feed, cut } = require("./escpos-builder");

function markdownToEscpos(markdown, options = {}) {
  const charsPerLine = Number.isInteger(options.charsPerLine) ? options.charsPerLine : 42;
  const strictMarkdown = Boolean(options.strictMarkdown);
  const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
  const tokens = md.parse(String(markdown || ""), {});
  const chunks = [init()];

  // render tokens into chunks here

  chunks.push(feed(4), cut(true));
  return concat(chunks);
}

module.exports = { markdownToEscpos };
```

Implement concrete render helpers in the same file for v1:
- `wrapText(text, width)`
- `renderHeading(level, text, chunks)` using:
  - `#`: `align("center")`, `bold(true)`, `size(1, 1)`
  - `##`: `align("center")`, `bold(true)`, `size(1, 0)`
  - `###+`: `align("left")`, `bold(true)`, `size(0, 0)`
- `renderParagraph`, `renderListItem`, `renderRule`, `renderCodeBlock`, `renderLink`

- [ ] **Step 4: Add fixture markdown sample**

Create `tests/fixtures/markdown-basic.md`:

```md
# Store Title
## Specials

1. Espresso
2. Croissant

---

Visit [Site](https://example.com)

```
console.log("hello")
```
```

- [ ] **Step 5: Re-run renderer tests and make them pass**

Run:

```bash
node --test tests/markdown-to-escpos.test.js
```

Expected: PASS for heading hierarchy and basic output assertions.

- [ ] **Step 6: Commit renderer baseline**

```bash
git add src/markdown-to-escpos.js tests/markdown-to-escpos.test.js tests/fixtures/markdown-basic.md
git commit -m "feat: add markdown to escpos renderer baseline"
```

### Task 4: Add hybrid strict-mode behavior and unsupported-node handling

**Files:**
- Modify: `src/markdown-to-escpos.js`
- Modify: `tests/markdown-to-escpos.test.js`

- [ ] **Step 1: Add failing strict-mode tests**

Append tests:

```js
test("best-effort mode degrades inline HTML to text", () => {
  const out = markdownToEscpos("before <span>x</span> after", {
    charsPerLine: 42,
    strictMarkdown: false
  });
  assert.equal(Buffer.from(out).length > 0, true);
});

test("strict mode rejects unsupported html tokens", () => {
  assert.throws(
    () => markdownToEscpos("<div>bad</div>", { charsPerLine: 42, strictMarkdown: true }),
    /Unsupported markdown construct/
  );
});
```

- [ ] **Step 2: Run renderer tests to confirm strict behavior fails initially**

Run:

```bash
node --test tests/markdown-to-escpos.test.js
```

Expected: FAIL on strict-mode assertion.

- [ ] **Step 3: Implement strict-mode guard in renderer**

In token iteration, detect unsupported token types (such as `html_block`, `html_inline`) and branch by mode:

```js
if (token.type === "html_block" || token.type === "html_inline") {
  if (strictMarkdown) {
    throw new Error(`Unsupported markdown construct: ${token.type}`);
  }
  chunks.push(...renderWrappedPlainText(token.content, charsPerLine));
  continue;
}
```

- [ ] **Step 4: Re-run renderer tests to verify strict and best-effort behavior**

Run:

```bash
node --test tests/markdown-to-escpos.test.js
```

Expected: PASS for both strict and best-effort tests.

- [ ] **Step 5: Commit strict-mode support**

```bash
git add src/markdown-to-escpos.js tests/markdown-to-escpos.test.js
git commit -m "feat: support strict markdown validation mode"
```

### Task 5: Implement production CLI entrypoint for markdown printing

**Files:**
- Create: `src/print-cli.js`
- Modify: `tests/print-cli.test.js`

- [ ] **Step 1: Add failing CLI contract tests**

Append to `tests/print-cli.test.js` pure-function tests for input resolution:

```js
const { resolveMarkdownInput } = require("../src/print-cli");

test("resolveMarkdownInput prefers markdown-file over markdown string", async () => {
  const input = await resolveMarkdownInput({
    argv: ["--markdown-file=tests/fixtures/markdown-basic.md", "--markdown=ignored"]
  });
  assert.equal(input.source, "file");
});

test("resolveMarkdownInput throws when no markdown input provided", async () => {
  await assert.rejects(
    () => resolveMarkdownInput({ argv: [] }),
    /Provide --markdown-file or --markdown/
  );
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
node --test tests/print-cli.test.js
```

Expected: FAIL with module-not-found for `src/print-cli.js`.

- [ ] **Step 3: Implement `src/print-cli.js` with testable exported helpers**

Create `src/print-cli.js`:

```js
"use strict";

const { readFile } = require("fs/promises");
const { getArgValue, hasFlag, selectPrinterName } = require("./cli-common");
const { markdownToEscpos } = require("./markdown-to-escpos");
const { listPrinters, printRawToWindowsPrinter } = require("./windows-raw-printer");

async function resolveMarkdownInput({ argv }) {
  const markdownFile = getArgValue(argv, "--markdown-file");
  const markdownInline = getArgValue(argv, "--markdown");
  if (markdownFile) {
    const content = await readFile(markdownFile, "utf8");
    return { source: "file", markdown: content, markdownFile };
  }
  if (markdownInline) {
    return { source: "inline", markdown: markdownInline, markdownFile: null };
  }
  throw new Error("Provide --markdown-file or --markdown");
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = hasFlag(argv, "--dry-run");
  const strictMarkdown = hasFlag(argv, "--strict-markdown");
  const charsPerLine = Number.parseInt(getArgValue(argv, "--chars-per-line") || "42", 10);

  const { markdown } = await resolveMarkdownInput({ argv });
  const payload = Buffer.from(markdownToEscpos(markdown, { charsPerLine, strictMarkdown }));

  const printers = await listPrinters();
  if (!printers.length) throw new Error("No Windows printers found");

  const printerName = selectPrinterName({
    requested: getArgValue(argv, "--printer"),
    envPrinter: process.env.ESC_POS_PRINTER,
    printers
  });

  if (dryRun) return { printerName, payloadLength: payload.length };
  await printRawToWindowsPrinter(printerName, payload);
  return { printerName, payloadLength: payload.length };
}

module.exports = { main, resolveMarkdownInput };

if (require.main === module) {
  main().then(
    () => console.log("Print job submitted as RAW ESC/POS."),
    (err) => {
      console.error(err.message || err);
      process.exitCode = 1;
    }
  );
}
```

- [ ] **Step 4: Re-run CLI tests and ensure pass**

Run:

```bash
node --test tests/print-cli.test.js
```

Expected: PASS for argument and input resolution behavior.

- [ ] **Step 5: Commit new print CLI**

```bash
git add src/print-cli.js tests/print-cli.test.js
git commit -m "feat: add production cli for markdown printing"
```

### Task 6: Update docs and verify end-to-end commands

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README usage section for markdown printing**

Add command examples:

```md
## Markdown Printing

Dry run with inline markdown:

```bash
npm run print:dry -- --markdown="# Hello\n\n- One\n- Two"
```

Print from markdown file:

```bash
npm run print -- --markdown-file="tests/fixtures/markdown-basic.md" --printer="EPSON TM-T88V Receipt"
```

Strict mode:

```bash
npm run print -- --markdown-file="receipt.md" --strict-markdown
```
```

- [ ] **Step 2: Run complete automated test suite**

Run:

```bash
npm run test
```

Expected: PASS for all tests.

- [ ] **Step 3: Run CLI dry-run verification**

Run:

```bash
npm run print:dry -- --markdown="# TM-T88V\n\n## Daily Menu\n\n1. Espresso\n2. Croissant" --chars-per-line=42
```

Expected: command exits `0`, shows selected printer and does not submit print job.

- [ ] **Step 4: Run hardware print verification**

Run:

```bash
npm run print -- --markdown-file="tests/fixtures/markdown-basic.md" --printer="EPSON TM-T88V Receipt"
```

Expected: receipt prints with `#` as extra-large centered heading and `##` as large centered heading.

- [ ] **Step 5: Commit docs and final integration changes**

```bash
git add README.md
git commit -m "docs: document markdown printing cli usage"
```

## Final Verification Checklist

- [ ] `npm run test` passes.
- [ ] `npm run print:test:dry` still works unchanged.
- [ ] `npm run print:dry -- --markdown="..."` works and does not print.
- [ ] Real print from markdown file works on TM-T88V.
- [ ] Strict mode rejects unsupported constructs.
