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

test("preserves marker for empty parent list item with nested child", () => {
  const out = Buffer.from(markdownToEscpos("-\n  - child\n", { charsPerLine: 42, strictMarkdown: false }));
  const text = out.toString("utf8");

  assert.equal(text.includes("- \n"), true);
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

test("retains multi-paragraph content within a list item", () => {
  const markdown = "- First paragraph in item\n\n  Second paragraph in same item\n";
  const out = Buffer.from(markdownToEscpos(markdown, {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");
  const lines = text.split(/\r?\n/);
  const firstParagraphLine = lines.findIndex((line) => line.includes("First paragraph in item"));
  const secondParagraphLine = lines.findIndex((line) => line.includes("Second paragraph in same item"));
  const betweenParagraphs = lines.slice(firstParagraphLine + 1, secondParagraphLine);

  assert.notEqual(firstParagraphLine, -1);
  assert.notEqual(secondParagraphLine, -1);
  assert.equal(secondParagraphLine > firstParagraphLine, true);
  assert.equal(betweenParagraphs.some((line) => line.trim() === ""), true);
});

test("retains nested ordered and unordered list content", () => {
  const markdown = [
    "1. Parent ordered",
    "   - Child bullet",
    "   1. Child ordered",
    "",
    "   Parent trailing paragraph",
    "2. Sibling ordered",
    ""
  ].join("\n");
  const out = Buffer.from(markdownToEscpos(markdown, {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");
  const parentIndex = text.indexOf("1. Parent ordered");
  const childBulletIndex = text.indexOf("- Child bullet");
  const childOrderedIndex = text.indexOf("1. Child ordered");
  const trailingParagraphIndex = text.indexOf("Parent trailing paragraph");
  const siblingIndex = text.indexOf("2. Sibling ordered");

  assert.equal((text.match(/1\. Parent ordered/g) || []).length, 1);
  assert.equal((text.match(/- Child bullet/g) || []).length, 1);
  assert.equal((text.match(/1\. Child ordered/g) || []).length, 1);
  assert.equal((text.match(/Parent trailing paragraph/g) || []).length, 1);
  assert.equal((text.match(/2\. Sibling ordered/g) || []).length, 1);

  assert.notEqual(parentIndex, -1);
  assert.notEqual(childBulletIndex, -1);
  assert.notEqual(childOrderedIndex, -1);
  assert.notEqual(trailingParagraphIndex, -1);
  assert.notEqual(siblingIndex, -1);
  assert.equal(parentIndex < childBulletIndex, true);
  assert.equal(childBulletIndex < childOrderedIndex, true);
  assert.equal(childOrderedIndex < trailingParagraphIndex, true);
  assert.equal(trailingParagraphIndex < siblingIndex, true);
});

test("keeps unchecked task marker and normalizes checked marker to lowercase x", () => {
  const markdown = "- [ ] open task\n- [X] done task\n";
  const out = Buffer.from(markdownToEscpos(markdown, {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("[X]"), false);
  assert.equal(text.includes("- [ ] open task"), true);
  assert.equal(text.includes("- [x] open task"), false);
  assert.equal(text.includes("- [x] done task"), true);
});

test("preserves explicit soft line breaks inside a paragraph", () => {
  const out = Buffer.from(markdownToEscpos("Subtotal 7.50\nTax 0.00\nTotal 7.50\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("Subtotal 7.50\nTax 0.00\nTotal 7.50"), true);
});

test("renders strong text with ESC/POS bold toggles", () => {
  const bytes = Buffer.from(markdownToEscpos("before **BOLD** after\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));

  const boldOn = Buffer.from([0x1b, 0x45, 0x01]);
  const boldOff = Buffer.from([0x1b, 0x45, 0x00]);
  const boldText = Buffer.from("BOLD");
  const boldOnIndex = bytes.indexOf(boldOn);
  const boldTextIndex = bytes.indexOf(boldText);
  const boldOffIndex = bytes.indexOf(boldOff);

  assert.notEqual(boldOnIndex, -1);
  assert.notEqual(boldTextIndex, -1);
  assert.notEqual(boldOffIndex, -1);
  assert.equal(boldOnIndex < boldTextIndex, true);
  assert.equal(boldTextIndex < boldOffIndex, true);
});

test("degrades emphasis and strikethrough to plain readable text", () => {
  const out = Buffer.from(markdownToEscpos("This has *emphasis* and ~~strike~~ text.\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("emphasis"), true);
  assert.equal(text.includes("strike"), true);
  assert.equal(text.includes("*emphasis*"), false);
  assert.equal(text.includes("~~strike~~"), false);
});

test("renders blockquotes with a quote prefix", () => {
  const out = Buffer.from(markdownToEscpos("> quoted line\n> second line\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("| quoted line"), true);
  assert.equal(text.includes("| second line"), true);
});

test("wraps inline paragraph text on word boundaries without leading continuation spaces", () => {
  const out = Buffer.from(markdownToEscpos("alpha beta gamma\n", {
    charsPerLine: 10,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("alpha beta\ngamma\n"), true);
  assert.equal(text.includes("\n gamma\n"), false);
});

test("keeps strong inline wrapping word-aware with no leading continuation spaces", () => {
  const out = Buffer.from(markdownToEscpos("alpha **beta** gamma\n", {
    charsPerLine: 10,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("\n gamma\n"), false);

  const boldOn = Buffer.from([0x1b, 0x45, 0x01]);
  const boldOff = Buffer.from([0x1b, 0x45, 0x00]);
  const boldText = Buffer.from("beta");
  const boldOnIndex = out.indexOf(boldOn);
  const boldTextIndex = out.indexOf(boldText);
  const boldOffIndex = out.indexOf(boldOff);

  assert.notEqual(boldOnIndex, -1);
  assert.notEqual(boldTextIndex, -1);
  assert.notEqual(boldOffIndex, -1);
  assert.equal(boldOnIndex < boldTextIndex, true);
  assert.equal(boldTextIndex < boldOffIndex, true);
});
