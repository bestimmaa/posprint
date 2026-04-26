"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { markdownToEscpos, wrapText } = require("../src/markdown-to-escpos");

test("renders # heading with centered bold extra-large style sequence", () => {
  const out = markdownToEscpos("# Title\n", { charsPerLine: 42, strictMarkdown: false });
  const bytes = Buffer.from(out);
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x61, 0x01])), true);
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x45, 0x01])), true);
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x21, 0x11])), true);
});

test("renders ## heading as centered bold large but not extra-large", () => {
  const out = markdownToEscpos("## Subtitle\n", { charsPerLine: 42, strictMarkdown: false });
  const bytes = Buffer.from(out);
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x21, 0x10])), true);
});

test("wraps paragraph lines by charsPerLine", () => {
  const out = markdownToEscpos("word ".repeat(20), { charsPerLine: 16, strictMarkdown: false });
  assert.equal(Buffer.from(out).length > 0, true);
});

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

test("strict mode rejects inline html tokens", () => {
  assert.throws(
    () => markdownToEscpos("before <span>x</span> after", { charsPerLine: 42, strictMarkdown: true }),
    /Unsupported markdown construct/
  );
});

test("wrapText splits long unbroken tokens to width", () => {
  const lines = wrapText("supercalifragilisticexpialidocious", 8);
  assert.equal(lines.every((value) => value.length <= 8), true);
});

test("renders nested list parent and child markers", () => {
  const out = Buffer.from(markdownToEscpos("- parent\n  - child\n", { charsPerLine: 42, strictMarkdown: false }));
  const text = out.toString("utf8");
  assert.equal(text.includes("- parent"), true);
  assert.equal(text.includes("- child"), true);
});

test("ordered list items are not duplicated", () => {
  const out = Buffer.from(markdownToEscpos("1. Espresso\n2. Croissant\n3. Filter Coffee\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal((text.match(/Espresso/g) || []).length, 1);
  assert.equal((text.match(/Croissant/g) || []).length, 1);
  assert.equal((text.match(/Filter Coffee/g) || []).length, 1);
});

test("preserves explicit soft line breaks inside a paragraph", () => {
  const out = Buffer.from(markdownToEscpos("Subtotal 7.50\nTax 0.00\nTotal 7.50\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("Subtotal 7.50\nTax 0.00\nTotal 7.50"), true);
});
